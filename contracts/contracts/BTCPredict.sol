// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ── Pyth Price Feed interface (pull-oracle model) ──────────────────────────────
interface IPyth {
    struct Price {
        int64  price;
        uint64 conf;
        int32  expo;
        uint256 publishTime;
    }
    function getPriceUnsafe(bytes32 id)                                  external view    returns (Price memory);
    function getUpdateFee(bytes[] calldata updateData)                   external view    returns (uint256);
    function updatePriceFeeds(bytes[] calldata updateData)               external payable;
}

/// @title BTCPredict — BaseCast 1-Minute BTC Prediction Market
/// @notice Players bet UP or DOWN on BTC/USD price for 1-minute rounds.
///         Uses Pyth Price Feed (pull oracle) for manipulation-proof settlement.
///         Payout is proportional to pool: winners split losers' pool minus 3% house fee.
///         House fee is forwarded to GameVault.
///
/// Round lifecycle (keeper drives transitions every 60 s):
///   OPEN (epoch N)  →  executeRound()  →  LOCKED (epoch N)  →  executeRound()  →  ENDED (epoch N)
///                                          OPEN   (epoch N+1)
///
/// Pyth contract addresses:
///   Base Mainnet : 0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a
///   Base Sepolia : 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
///
/// BTC/USD price feed ID (same on all chains):
///   0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac3f3438fe94f7f04e90b33f2c6
contract BTCPredict is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Types ──────────────────────────────────────────────────────────────
    enum Status { Pending, Open, Locked, Ended, Cancelled }

    struct Round {
        uint256 epoch;
        uint256 startTimestamp;
        uint256 lockTimestamp;
        uint256 closeTimestamp;
        int64   lockPrice;
        int64   closePrice;
        uint256 totalAmount;
        uint256 upAmount;
        uint256 downAmount;
        uint256 treasuryAmount;
        Status  status;
    }

    struct BetInfo {
        uint256 amount;
        bool    isUp;
        bool    claimed;
    }

    // ── State ──────────────────────────────────────────────────────────────
    IERC20  public immutable usdc;
    IPyth   public immutable pyth;
    bytes32 public immutable btcUsdPriceId;

    address public owner;
    address public operator;
    address public vault;

    uint256 public currentEpoch;
    uint256 public intervalSeconds  = 60;
    uint256 public bufferSeconds    = 30;
    uint256 public minBetAmount     = 500_000;       // $0.50 USDC (6 decimals)
    uint256 public maxBetAmount     = 500_000_000;   // $500  USDC
    uint256 public treasuryFeeBps   = 300;            // 3 %
    uint256 public treasuryBalance;

    bool public genesisStartOnce;
    bool public genesisLockOnce;
    bool public paused;

    mapping(uint256 => Round)                       public rounds;
    mapping(uint256 => mapping(address => BetInfo)) public betInfos;
    mapping(address => uint256[])                   public userRounds;

    // ── Events ─────────────────────────────────────────────────────────────
    event StartRound  (uint256 indexed epoch);
    event LockRound   (uint256 indexed epoch, int64 price);
    event EndRound    (uint256 indexed epoch, int64 price, bool bullWon);
    event CancelRound (uint256 indexed epoch);
    event BetUp       (address indexed player, uint256 indexed epoch, uint256 amount);
    event BetDown     (address indexed player, uint256 indexed epoch, uint256 amount);
    event Claim       (address indexed player, uint256 indexed epoch, uint256 amount);
    event TreasuryClaim(uint256 amount);

    // ── Modifiers ──────────────────────────────────────────────────────────
    modifier onlyOwner()    { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyOperator() { require(msg.sender == operator || msg.sender == owner, "Not operator"); _; }
    modifier whenNotPaused(){ require(!paused, "Paused"); _; }

    // ── Constructor ────────────────────────────────────────────────────────
    /// @param _usdc     USDC token address
    /// @param _pyth     Pyth contract address (see above for network values)
    /// @param _vault    GameVault address (receives house fee)
    /// @param _priceId  Pyth BTC/USD price feed ID
    constructor(
        address _usdc,
        address _pyth,
        address _vault,
        bytes32 _priceId
    ) {
        require(_usdc != address(0) && _pyth != address(0) && _vault != address(0), "Zero addr");
        usdc         = IERC20(_usdc);
        pyth         = IPyth(_pyth);
        vault        = _vault;
        btcUsdPriceId = _priceId;
        owner        = msg.sender;
        operator     = msg.sender;
    }

    // ── Keeper: round management ───────────────────────────────────────────

    /// @notice Bootstrap: start the very first round. Call once.
    function genesisStartRound() external onlyOperator whenNotPaused {
        require(!genesisStartOnce, "Already started");
        currentEpoch++;
        _startRound(currentEpoch);
        genesisStartOnce = true;
    }

    /// @notice Bootstrap: lock the first round and open the second. Call ~60 s after genesis start.
    /// @param updateData  Fresh price update bytes from Pyth Hermes API (may be empty if price already fresh)
    function genesisLockRound(bytes[] calldata updateData)
        external payable onlyOperator whenNotPaused
    {
        require(genesisStartOnce, "Not started");
        require(!genesisLockOnce, "Already locked");
        require(block.timestamp >= rounds[currentEpoch].lockTimestamp, "Too early");

        _updatePyth(updateData);
        int64 price = _getPythPrice();

        _lockRound(currentEpoch, price);
        currentEpoch++;
        _startRound(currentEpoch);
        genesisLockOnce = true;
    }

    /// @notice Regular keeper call — ends previous round, locks current, opens new.
    ///         Call every `intervalSeconds`. Send ETH to cover Pyth update fee if needed.
    /// @param updateData  Fresh price update bytes from Pyth Hermes API
    function executeRound(bytes[] calldata updateData)
        external payable onlyOperator whenNotPaused
    {
        require(genesisStartOnce && genesisLockOnce, "Genesis not done");
        require(block.timestamp >= rounds[currentEpoch].lockTimestamp, "Too early");

        _updatePyth(updateData);
        int64 price = _getPythPrice();

        // End the previously-locked round
        _endRound(currentEpoch - 1, price);

        // Lock the current open round
        _lockRound(currentEpoch, price);

        // Open the next round
        currentEpoch++;
        _startRound(currentEpoch);
    }

    // ── User: betting ──────────────────────────────────────────────────────

    /// @notice Predict price will go UP. Approve USDC to this contract first.
    function betUp(uint256 epoch, uint256 amount) external whenNotPaused nonReentrant {
        require(epoch == currentEpoch, "Wrong epoch");
        require(_bettable(epoch),      "Not bettable");
        require(amount >= minBetAmount, "Below min");
        require(amount <= maxBetAmount, "Above max");
        require(betInfos[epoch][msg.sender].amount == 0, "Already bet");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        Round storage r = rounds[epoch];
        r.totalAmount += amount;
        r.upAmount    += amount;

        betInfos[epoch][msg.sender] = BetInfo({amount: amount, isUp: true, claimed: false});
        userRounds[msg.sender].push(epoch);

        emit BetUp(msg.sender, epoch, amount);
    }

    /// @notice Predict price will go DOWN. Approve USDC to this contract first.
    function betDown(uint256 epoch, uint256 amount) external whenNotPaused nonReentrant {
        require(epoch == currentEpoch, "Wrong epoch");
        require(_bettable(epoch),      "Not bettable");
        require(amount >= minBetAmount, "Below min");
        require(amount <= maxBetAmount, "Above max");
        require(betInfos[epoch][msg.sender].amount == 0, "Already bet");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        Round storage r = rounds[epoch];
        r.totalAmount += amount;
        r.downAmount  += amount;

        betInfos[epoch][msg.sender] = BetInfo({amount: amount, isUp: false, claimed: false});
        userRounds[msg.sender].push(epoch);

        emit BetDown(msg.sender, epoch, amount);
    }

    // ── User: claiming ─────────────────────────────────────────────────────

    /// @notice Collect winnings from multiple ended rounds in one tx.
    function claim(uint256[] calldata epochs) external nonReentrant {
        uint256 total;
        for (uint256 i; i < epochs.length;) {
            uint256 epoch  = epochs[i];
            Round   storage r   = rounds[epoch];
            BetInfo storage bet = betInfos[epoch][msg.sender];

            require(r.status == Status.Ended || r.status == Status.Cancelled, "Not settled");
            require(!bet.claimed, "Already claimed");
            require(bet.amount > 0, "No bet");

            uint256 reward;
            if (r.status == Status.Cancelled) {
                reward = bet.amount;
            } else if (_isWinner(epoch, msg.sender)) {
                uint256 pool = r.totalAmount - r.treasuryAmount;
                uint256 side = bet.isUp ? r.upAmount : r.downAmount;
                reward = side > 0 ? (bet.amount * pool) / side : 0;
            }

            if (reward > 0) {
                bet.claimed = true;
                total += reward;
                emit Claim(msg.sender, epoch, reward);
            }
            unchecked { i++; }
        }
        if (total > 0) usdc.safeTransfer(msg.sender, total);
    }

    /// @notice Withdraw accumulated treasury (house) fees to vault.
    function claimTreasury() external onlyOwner {
        uint256 amt = treasuryBalance;
        require(amt > 0, "Nothing to claim");
        treasuryBalance = 0;
        usdc.safeTransfer(vault, amt);
        emit TreasuryClaim(amt);
    }

    // ── View helpers ───────────────────────────────────────────────────────

    function claimable(uint256 epoch, address user) external view returns (bool) {
        BetInfo memory bet = betInfos[epoch][user];
        Round   memory r   = rounds[epoch];
        if (bet.amount == 0 || bet.claimed)            return false;
        if (r.status == Status.Cancelled)               return true;
        if (r.status != Status.Ended)                   return false;
        return _isWinner(epoch, user);
    }

    function getUserRounds(address user) external view returns (uint256[] memory) {
        return userRounds[user];
    }

    function getRound(uint256 epoch) external view returns (Round memory) {
        return rounds[epoch];
    }

    function currentPythPrice() external view returns (int64 price, uint256 publishTime) {
        IPyth.Price memory p = pyth.getPriceUnsafe(btcUsdPriceId);
        return (p.price, p.publishTime);
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _startRound(uint256 epoch) internal {
        Round storage r  = rounds[epoch];
        r.epoch          = epoch;
        r.startTimestamp = block.timestamp;
        r.lockTimestamp  = block.timestamp + intervalSeconds;
        r.closeTimestamp = block.timestamp + (intervalSeconds * 2);
        r.status         = Status.Open;
        emit StartRound(epoch);
    }

    function _lockRound(uint256 epoch, int64 price) internal {
        Round storage r   = rounds[epoch];
        r.lockTimestamp   = block.timestamp;
        r.closeTimestamp  = block.timestamp + intervalSeconds;
        r.lockPrice       = price;
        r.status          = Status.Locked;
        emit LockRound(epoch, price);
    }

    function _endRound(uint256 epoch, int64 price) internal {
        Round storage r = rounds[epoch];
        r.closeTimestamp = block.timestamp;
        r.closePrice     = price;

        // Cancel if one-sided or draw — full refund, no fee
        if (r.upAmount == 0 || r.downAmount == 0 || price == r.lockPrice) {
            r.status = Status.Cancelled;
            emit CancelRound(epoch);
            return;
        }

        bool bullWon = price > r.lockPrice;
        uint256 fee  = (r.totalAmount * treasuryFeeBps) / 10_000;
        r.treasuryAmount = fee;
        r.status         = Status.Ended;
        treasuryBalance += fee;

        emit EndRound(epoch, price, bullWon);
    }

    function _isWinner(uint256 epoch, address user) internal view returns (bool) {
        Round   memory r   = rounds[epoch];
        BetInfo memory bet = betInfos[epoch][user];
        if (r.status != Status.Ended) return false;
        return bet.isUp == (r.closePrice > r.lockPrice);
    }

    function _bettable(uint256 epoch) internal view returns (bool) {
        return rounds[epoch].status == Status.Open
            && rounds[epoch].lockTimestamp > block.timestamp;
    }

    function _updatePyth(bytes[] calldata updateData) internal {
        if (updateData.length == 0) return;
        uint256 fee = pyth.getUpdateFee(updateData);
        if (fee > 0) {
            require(address(this).balance >= fee, "Insufficient ETH for Pyth fee");
            pyth.updatePriceFeeds{value: fee}(updateData);
        }
    }

    function _getPythPrice() internal view returns (int64) {
        IPyth.Price memory p = pyth.getPriceUnsafe(btcUsdPriceId);
        require(p.price > 0, "Invalid Pyth price");
        return p.price;
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function setOperator(address _op)        external onlyOwner { require(_op != address(0), "Zero"); operator = _op; }
    function setVault(address _v)            external onlyOwner { require(_v  != address(0), "Zero"); vault    = _v;  }
    function setMinBet(uint256 a)            external onlyOwner { minBetAmount   = a; }
    function setMaxBet(uint256 a)            external onlyOwner { maxBetAmount   = a; }
    function setIntervalSeconds(uint256 s)   external onlyOwner { require(s >= 30, "Too short"); intervalSeconds = s; }
    function setTreasuryFeeBps(uint256 bps)  external onlyOwner { require(bps <= 1000, "Max 10%");  treasuryFeeBps  = bps; }
    function setPaused(bool _p)              external onlyOwner { paused = _p; }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero");
        owner = newOwner;
    }

    function withdrawEth(uint256 amount) external onlyOwner {
        (bool ok,) = owner.call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    receive() external payable {}
}
