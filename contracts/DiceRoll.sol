// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./GameVault.sol";

/// @title DiceRoll — BaseCast Provably Fair Dice
/// @notice Player picks a number 1–6. Win = 5.82x payout (3% house edge on 6-sided die)
/// @dev Uses Chainlink VRF v2.5. Also supports range bets (low 1-3, high 4-6).
contract DiceRoll is VRFConsumerBaseV2Plus, Ownable, Pausable {

    // ─────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────

    /// @notice Bet type: exact number OR range (low/high)
    enum BetType { EXACT, RANGE_LOW, RANGE_HIGH }

    enum BetStatus { PENDING, WON, LOST, REFUNDED }

    struct Bet {
        address player;
        uint256 wager;         // USDC (6 decimals)
        BetType betType;
        uint8   exactNumber;   // 1–6, only used if BetType.EXACT
        BetStatus status;
        uint256 payout;
        uint256 timestamp;
        uint8   rolledNumber;  // 1–6 result
        uint256 randomWord;
    }

    // ─────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────

    address private constant VRF_COORDINATOR = 0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634;

    bytes32 private constant KEY_HASH =
        0x007e09e27c0e5b5aa2103b28788c1b1a4210b0eb4f5df8c7b5e2afb1c3b9ba8d;

    uint32 private constant CALLBACK_GAS_LIMIT   = 200_000;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS             = 1;

    // ─────────────────────────────────────────────
    // Payout Config
    // ─────────────────────────────────────────────

    /// @notice EXACT bet: win = 5.82x (3% edge on 1/6 odds)
    ///         Raw fair = 6x → with 3% edge: 6 * 0.97 = 5.82
    uint256 public exactPayoutNumerator   = 582;
    uint256 public exactPayoutDenominator = 100;

    /// @notice RANGE bet (3 out of 6): win = 1.94x (3% edge on 1/2 odds)
    uint256 public rangePayoutNumerator   = 194;
    uint256 public rangePayoutDenominator = 100;

    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────

    GameVault public immutable vault;
    uint256 public subscriptionId;

    mapping(uint256 => Bet) public bets;
    mapping(address => uint256[]) public playerBets;

    uint256 public totalBetsPlaced;
    uint256 public totalWagered;
    uint256 public totalPaidOut;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event BetPlaced(
        uint256 indexed requestId,
        address indexed player,
        uint256 wager,
        BetType betType,
        uint8   exactNumber,
        uint256 timestamp
    );

    event BetSettled(
        uint256 indexed requestId,
        address indexed player,
        uint256 wager,
        BetType betType,
        uint8   exactNumber,
        uint8   rolledNumber,
        bool    won,
        uint256 payout
    );

    event BetRefunded(uint256 indexed requestId, address indexed player, uint256 wager);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor(address _vault, uint256 _subscriptionId)
        VRFConsumerBaseV2Plus(VRF_COORDINATOR)
        Ownable(msg.sender)
    {
        require(_vault != address(0), "DiceRoll: zero vault");
        vault = GameVault(_vault);
        subscriptionId = _subscriptionId;
    }

    // ─────────────────────────────────────────────
    // Player Actions
    // ─────────────────────────────────────────────

    /// @notice Place an exact number bet (pick 1–6)
    function placeBetExact(uint256 wager, uint8 number)
        external
        whenNotPaused
        returns (uint256 requestId)
    {
        require(number >= 1 && number <= 6, "DiceRoll: number must be 1-6");
        return _placeBet(wager, BetType.EXACT, number);
    }

    /// @notice Place a range bet — LOW (1-3) or HIGH (4-6)
    function placeBetRange(uint256 wager, bool high)
        external
        whenNotPaused
        returns (uint256 requestId)
    {
        BetType bt = high ? BetType.RANGE_HIGH : BetType.RANGE_LOW;
        return _placeBet(wager, bt, 0);
    }

    function _placeBet(uint256 wager, BetType betType, uint8 exactNumber)
        internal
        returns (uint256 requestId)
    {
        vault.receiveBet(msg.sender, wager);

        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:              KEY_HASH,
                subId:                subscriptionId,
                requestConfirmations: REQUEST_CONFIRMATIONS,
                callbackGasLimit:     CALLBACK_GAS_LIMIT,
                numWords:             NUM_WORDS,
                extraArgs:            VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                )
            })
        );

        bets[requestId] = Bet({
            player:       msg.sender,
            wager:        wager,
            betType:      betType,
            exactNumber:  exactNumber,
            status:       BetStatus.PENDING,
            payout:       0,
            timestamp:    block.timestamp,
            rolledNumber: 0,
            randomWord:   0
        });

        playerBets[msg.sender].push(requestId);
        totalBetsPlaced++;
        totalWagered += wager;

        emit BetPlaced(requestId, msg.sender, wager, betType, exactNumber, block.timestamp);
    }

    // ─────────────────────────────────────────────
    // VRF Callback
    // ─────────────────────────────────────────────

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords)
        internal
        override
    {
        Bet storage bet = bets[requestId];
        require(bet.player != address(0), "DiceRoll: unknown requestId");
        require(bet.status == BetStatus.PENDING, "DiceRoll: already settled");

        uint256 rw = randomWords[0];
        bet.randomWord = rw;

        // Roll: 1–6
        uint8 rolled = uint8((rw % 6) + 1);
        bet.rolledNumber = rolled;

        bool won = false;
        if (bet.betType == BetType.EXACT) {
            won = (rolled == bet.exactNumber);
        } else if (bet.betType == BetType.RANGE_LOW) {
            won = (rolled <= 3);
        } else {
            won = (rolled >= 4);
        }

        uint256 payout = 0;
        if (won) {
            if (bet.betType == BetType.EXACT) {
                payout = (bet.wager * exactPayoutNumerator) / exactPayoutDenominator;
            } else {
                payout = (bet.wager * rangePayoutNumerator) / rangePayoutDenominator;
            }
            bet.status = BetStatus.WON;
        } else {
            bet.status = BetStatus.LOST;
        }

        bet.payout = payout;
        totalPaidOut += payout;

        vault.settleBet(address(this), bet.player, bet.wager, payout);

        emit BetSettled(
            requestId, bet.player, bet.wager,
            bet.betType, bet.exactNumber, rolled, won, payout
        );
    }

    // ─────────────────────────────────────────────
    // Emergency Refund
    // ─────────────────────────────────────────────

    function refundStuckBet(uint256 requestId) external onlyOwner {
        Bet storage bet = bets[requestId];
        require(bet.player != address(0), "DiceRoll: unknown requestId");
        require(bet.status == BetStatus.PENDING, "DiceRoll: not pending");
        require(block.timestamp >= bet.timestamp + 1 hours, "DiceRoll: too early");

        bet.status = BetStatus.REFUNDED;
        vault.settleBet(address(this), bet.player, bet.wager, bet.wager);
        emit BetRefunded(requestId, bet.player, bet.wager);
    }

    // ─────────────────────────────────────────────
    // View / Verification
    // ─────────────────────────────────────────────

    function getBet(uint256 requestId) external view returns (Bet memory) {
        return bets[requestId];
    }

    function getPlayerBets(address player) external view returns (uint256[] memory) {
        return playerBets[player];
    }

    /// @notice Verify any settled bet outcome independently
    function verifyBet(uint256 requestId)
        external
        view
        returns (uint8 rolledNumber, bool won)
    {
        Bet memory bet = bets[requestId];
        require(bet.status != BetStatus.PENDING, "DiceRoll: not yet settled");
        rolledNumber = uint8((bet.randomWord % 6) + 1);
        if (bet.betType == BetType.EXACT) {
            won = (rolledNumber == bet.exactNumber);
        } else if (bet.betType == BetType.RANGE_LOW) {
            won = (rolledNumber <= 3);
        } else {
            won = (rolledNumber >= 4);
        }
    }

    // ─────────────────────────────────────────────
    // Owner Config
    // ─────────────────────────────────────────────

    function setSubscriptionId(uint256 _subId) external onlyOwner {
        subscriptionId = _subId;
    }

    function setExactPayout(uint256 _num, uint256 _den) external onlyOwner {
        require(_den > 0, "DiceRoll: zero denominator");
        exactPayoutNumerator = _num;
        exactPayoutDenominator = _den;
    }

    function setRangePayout(uint256 _num, uint256 _den) external onlyOwner {
        require(_den > 0, "DiceRoll: zero denominator");
        rangePayoutNumerator = _num;
        rangePayoutDenominator = _den;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
