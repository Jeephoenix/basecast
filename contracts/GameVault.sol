// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title GameVault — BaseCast House Treasury
/// @notice Holds USDC bankroll, enforces bet limits, settles payouts
/// @dev Only authorized game contracts can call settleBet()
contract GameVault is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────

    IERC20 public immutable usdc;

    /// @notice Maximum single bet as basis points of vault balance (default 100 = 1%)
    uint256 public maxBetBps = 100;

    /// @notice Minimum bet in USDC (6 decimals) — default $0.50
    uint256 public minBet = 0.5e6;

    /// @notice Authorized game contracts allowed to call settleBet
    mapping(address => bool) public authorizedGames;

    /// @notice Accumulated house profit (net of payouts)
    uint256 public houseProfit;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event GameAuthorized(address indexed game, bool authorized);
    event BetSettled(address indexed game, address indexed player, uint256 wager, uint256 payout);
    event HouseDeposit(address indexed owner, uint256 amount);
    event HouseWithdraw(address indexed owner, uint256 amount);
    event MaxBetBpsUpdated(uint256 oldBps, uint256 newBps);
    event MinBetUpdated(uint256 oldMin, uint256 newMin);

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    modifier onlyGame() {
        require(authorizedGames[msg.sender], "GameVault: caller not authorized game");
        _;
    }

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /// @param _usdc USDC token address on Base (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "GameVault: zero address");
        usdc = IERC20(_usdc);
    }

    // ─────────────────────────────────────────────
    // Owner Functions
    // ─────────────────────────────────────────────

    /// @notice Authorize or revoke a game contract
    function setGameAuthorized(address game, bool authorized) external onlyOwner {
        require(game != address(0), "GameVault: zero address");
        authorizedGames[game] = authorized;
        emit GameAuthorized(game, authorized);
    }

    /// @notice Deposit USDC into house bankroll
    function depositHouseFunds(uint256 amount) external onlyOwner {
        require(amount > 0, "GameVault: zero amount");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit HouseDeposit(msg.sender, amount);
    }

    /// @notice Withdraw USDC from house bankroll (owner only)
    function withdrawHouseFunds(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "GameVault: zero amount");
        require(usdc.balanceOf(address(this)) >= amount, "GameVault: insufficient balance");
        usdc.safeTransfer(msg.sender, amount);
        emit HouseWithdraw(msg.sender, amount);
    }

    /// @notice Update maximum bet cap (in basis points of vault balance)
    function setMaxBetBps(uint256 _bps) external onlyOwner {
        require(_bps > 0 && _bps <= 500, "GameVault: bps out of range (1-500)");
        emit MaxBetBpsUpdated(maxBetBps, _bps);
        maxBetBps = _bps;
    }

    /// @notice Update minimum bet amount
    function setMinBet(uint256 _minBet) external onlyOwner {
        require(_minBet > 0, "GameVault: zero min bet");
        emit MinBetUpdated(minBet, _minBet);
        minBet = _minBet;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────────────────────────────
    // Game Interface
    // ─────────────────────────────────────────────

    /// @notice Pull wager from player into vault (called by game contracts before VRF)
    /// @param player The bettor's address
    /// @param wager  Amount in USDC (6 decimals)
    function receiveBet(address player, uint256 wager)
        external
        onlyGame
        whenNotPaused
        nonReentrant
    {
        require(wager >= minBet, "GameVault: below min bet");
        require(wager <= maxBet(), "GameVault: exceeds max bet");
        usdc.safeTransferFrom(player, address(this), wager);
    }

    /// @notice Settle a bet — pay out winner or retain house edge
    /// @param game   The game contract address (for event)
    /// @param player The bettor's address
    /// @param wager  Original wager amount
    /// @param payout Amount to send to player (0 = player lost)
    function settleBet(address game, address player, uint256 wager, uint256 payout)
        external
        onlyGame
        nonReentrant
    {
        require(game == msg.sender, "GameVault: game mismatch");

        if (payout > 0) {
            require(
                usdc.balanceOf(address(this)) >= payout,
                "GameVault: insufficient vault balance"
            );
            usdc.safeTransfer(player, payout);
        }

        // Track net profit (wager - payout); can go negative on big wins
        if (payout < wager) {
            houseProfit += wager - payout;
        } else if (payout > wager) {
            // Big win: reduce houseProfit tracker
            uint256 loss = payout - wager;
            houseProfit = houseProfit > loss ? houseProfit - loss : 0;
        }

        emit BetSettled(game, player, wager, payout);
    }

    // ─────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────

    /// @notice Current vault USDC balance
    function vaultBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Current maximum single bet allowed
    function maxBet() public view returns (uint256) {
        return (usdc.balanceOf(address(this)) * maxBetBps) / 10_000;
    }
}
