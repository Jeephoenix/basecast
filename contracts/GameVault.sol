// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GameVault — BaseCast Treasury + Leaderboard
contract GameVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20  public immutable usdc;
    address public owner;
    bool    public paused;

    uint256 public maxBetBps  = 100;      // 1% of vault
    uint256 public minBet     = 500_000;  // $0.50 USDC (6 decimals)
    uint256 public houseProfit;

    mapping(address => bool) public authorizedGames;

    // ── Leaderboard ────────────────────────────────────────────────────────
    struct PlayerStats {
        uint128 totalVolume;
        int128  totalPnl;
    }
    mapping(address => PlayerStats) public playerStats;
    address[] public leaderboardPlayers;
    mapping(address => bool) private _isTracked;

    // ── Events ─────────────────────────────────────────────────────────────
    event GameAuthorized(address indexed game, bool authorized);
    event BetSettled(address indexed game, address indexed player, uint256 wager, uint256 payout);
    event HouseDeposit(uint256 amount);
    event HouseWithdraw(uint256 amount);

    modifier onlyOwner()    { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyGame()     { require(authorizedGames[msg.sender], "Not authorized"); _; }
    modifier whenNotPaused(){ require(!paused, "Paused"); _; }

    /// @param _usdc Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
    /// @param _usdc Base Mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    constructor(address _usdc) {
        require(_usdc != address(0), "Zero address");
        usdc  = IERC20(_usdc);
        owner = msg.sender;
    }

    // ── Owner ──────────────────────────────────────────────────────────────
    function setGameAuthorized(address game, bool auth) external onlyOwner {
        authorizedGames[game] = auth;
        emit GameAuthorized(game, auth);
    }

    function depositHouseFunds(uint256 amount) external onlyOwner {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit HouseDeposit(amount);
    }

    function withdrawHouseFunds(uint256 amount) external onlyOwner nonReentrant {
        require(usdc.balanceOf(address(this)) >= amount, "Insufficient");
        usdc.safeTransfer(msg.sender, amount);
        emit HouseWithdraw(amount);
    }

    function setMaxBetBps(uint256 bps) external onlyOwner {
        require(bps >= 10 && bps <= 500, "Out of range");
        maxBetBps = bps;
    }

    function setMinBet(uint256 amount) external onlyOwner { minBet = amount; }
    function setPaused(bool _p)        external onlyOwner { paused = _p; }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero");
        owner = newOwner;
    }

    // ── Game Interface ─────────────────────────────────────────────────────
    function receiveBet(address player, uint256 wager)
        external onlyGame whenNotPaused nonReentrant
    {
        require(wager >= minBet,   "Below min");
        require(wager <= maxBet(), "Above max");
        usdc.safeTransferFrom(player, address(this), wager);
    }

    function settleBet(address player, uint256 wager, uint256 payout)
        external onlyGame nonReentrant
    {
        if (payout > 0) {
            require(usdc.balanceOf(address(this)) >= payout, "Vault dry");
            usdc.safeTransfer(player, payout);
        }
        if (payout < wager) {
            unchecked { houseProfit += wager - payout; }
        } else if (payout > wager) {
            uint256 loss = payout - wager;
            houseProfit  = houseProfit > loss ? houseProfit - loss : 0;
        }
        _updateStats(player, wager, payout);
        emit BetSettled(msg.sender, player, wager, payout);
    }

    // ── Leaderboard ────────────────────────────────────────────────────────
    function _updateStats(address player, uint256 wager, uint256 payout) internal {
        if (!_isTracked[player] && leaderboardPlayers.length < 200) {
            _isTracked[player] = true;
            leaderboardPlayers.push(player);
        }
        PlayerStats storage s = playerStats[player];
        unchecked {
            s.totalVolume += uint128(wager);
            if (payout >= wager) {
                s.totalPnl += int128(uint128(payout - wager));
            } else {
                s.totalPnl -= int128(uint128(wager - payout));
            }
        }
    }

    function getLeaderboardAddresses() external view returns (address[] memory) {
        return leaderboardPlayers;
    }

    function getMultipleStats(address[] calldata players)
        external view returns (uint128[] memory volumes, int128[] memory pnls)
    {
        uint256 len = players.length;
        volumes = new uint128[](len);
        pnls    = new int128[](len);
        for (uint256 i; i < len;) {
            PlayerStats storage s = playerStats[players[i]];
            volumes[i] = s.totalVolume;
            pnls[i]    = s.totalPnl;
            unchecked { i++; }
        }
    }

    // ── View ───────────────────────────────────────────────────────────────
    function vaultBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function maxBet() public view returns (uint256) {
        return (usdc.balanceOf(address(this)) * maxBetBps) / 10_000;
    }
}
