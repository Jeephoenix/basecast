// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./GameVault.sol";

/// @title CoinFlip — BaseCast Provably Fair Coin Flip
/// @notice Player picks HEADS or TAILS. Win = 1.94x payout (3% house edge)
/// @dev Uses Chainlink VRF v2.5 on Base Mainnet
contract CoinFlip is VRFConsumerBaseV2Plus, Ownable, Pausable {

    // ─────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────

    enum Side { HEADS, TAILS }

    enum BetStatus { PENDING, WON, LOST, REFUNDED }

    struct Bet {
        address player;
        uint256 wager;       // USDC amount (6 decimals)
        Side choice;         // Player's pick
        BetStatus status;
        uint256 payout;      // Actual payout (0 if lost)
        uint256 timestamp;
        uint256 randomWord;  // VRF result stored for verification
    }

    // ─────────────────────────────────────────────
    // Constants — Base Mainnet Chainlink VRF v2.5
    // ─────────────────────────────────────────────

    /// @dev VRF Coordinator on Base Mainnet
    address private constant VRF_COORDINATOR = 0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634;

    /// @dev 200 gwei key hash — adjust for desired speed/cost tradeoff
    bytes32 private constant KEY_HASH =
        0x007e09e27c0e5b5aa2103b28788c1b1a4210b0eb4f5df8c7b5e2afb1c3b9ba8d;

    uint32 private constant CALLBACK_GAS_LIMIT  = 200_000;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS            = 1;

    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────

    GameVault public immutable vault;

    /// @notice Chainlink VRF subscription ID
    uint256 public subscriptionId;

    /// @notice House edge in basis points (300 = 3%)
    uint256 public houseEdgeBps = 300;

    /// @notice Multiplier precision — payout = wager * payoutNumerator / 10000
    /// 3% edge on 2x game: payout = wager * 9700 / 5000 = wager * 1.94
    uint256 public payoutNumerator = 9700;
    uint256 public payoutDenominator = 5000;

    /// @notice requestId → Bet
    mapping(uint256 => Bet) public bets;

    /// @notice player → list of their requestIds (for history)
    mapping(address => uint256[]) public playerBets;

    /// @notice Total stats
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
        Side choice,
        uint256 timestamp
    );

    event BetSettled(
        uint256 indexed requestId,
        address indexed player,
        uint256 wager,
        Side choice,
        Side result,
        bool won,
        uint256 payout,
        uint256 randomWord
    );

    event BetRefunded(uint256 indexed requestId, address indexed player, uint256 wager);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor(address _vault, uint256 _subscriptionId)
        VRFConsumerBaseV2Plus(VRF_COORDINATOR)
        Ownable(msg.sender)
    {
        require(_vault != address(0), "CoinFlip: zero vault");
        vault = GameVault(_vault);
        subscriptionId = _subscriptionId;
    }

    // ─────────────────────────────────────────────
    // Player Actions
    // ─────────────────────────────────────────────

    /// @notice Place a coin flip bet
    /// @param wager  USDC amount to bet (must have pre-approved vault)
    /// @param choice HEADS (0) or TAILS (1)
    /// @return requestId Chainlink VRF request ID (use to track your bet)
    function placeBet(uint256 wager, Side choice)
        external
        whenNotPaused
        returns (uint256 requestId)
    {
        // Pull funds into vault (vault enforces min/max)
        vault.receiveBet(msg.sender, wager);

        // Request randomness from Chainlink VRF
        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:            KEY_HASH,
                subId:              subscriptionId,
                requestConfirmations: REQUEST_CONFIRMATIONS,
                callbackGasLimit:   CALLBACK_GAS_LIMIT,
                numWords:           NUM_WORDS,
                extraArgs:          VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                )
            })
        );

        // Store bet
        bets[requestId] = Bet({
            player:     msg.sender,
            wager:      wager,
            choice:     choice,
            status:     BetStatus.PENDING,
            payout:     0,
            timestamp:  block.timestamp,
            randomWord: 0
        });

        playerBets[msg.sender].push(requestId);

        totalBetsPlaced++;
        totalWagered += wager;

        emit BetPlaced(requestId, msg.sender, wager, choice, block.timestamp);
    }

    // ─────────────────────────────────────────────
    // VRF Callback
    // ─────────────────────────────────────────────

    /// @dev Called by Chainlink VRF Coordinator with the random result
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords)
        internal
        override
    {
        Bet storage bet = bets[requestId];
        require(bet.player != address(0), "CoinFlip: unknown requestId");
        require(bet.status == BetStatus.PENDING, "CoinFlip: already settled");

        uint256 randomWord = randomWords[0];
        bet.randomWord = randomWord;

        // Determine result: even = HEADS, odd = TAILS
        Side result = (randomWord % 2 == 0) ? Side.HEADS : Side.TAILS;

        bool won = (result == bet.choice);

        uint256 payout = 0;
        if (won) {
            payout = (bet.wager * payoutNumerator) / payoutDenominator;
            bet.status = BetStatus.WON;
        } else {
            bet.status = BetStatus.LOST;
        }

        bet.payout = payout;
        totalPaidOut += payout;

        // Settle via vault (pays out winner or retains for house)
        vault.settleBet(address(this), bet.player, bet.wager, payout);

        emit BetSettled(requestId, bet.player, bet.wager, bet.choice, result, won, payout, randomWord);
    }

    // ─────────────────────────────────────────────
    // Emergency Refund (owner only, if VRF fails)
    // ─────────────────────────────────────────────

    /// @notice Refund a stuck pending bet (use only if VRF callback never arrives)
    function refundStuckBet(uint256 requestId) external onlyOwner {
        Bet storage bet = bets[requestId];
        require(bet.player != address(0), "CoinFlip: unknown requestId");
        require(bet.status == BetStatus.PENDING, "CoinFlip: not pending");
        require(block.timestamp >= bet.timestamp + 1 hours, "CoinFlip: too early to refund");

        bet.status = BetStatus.REFUNDED;
        vault.settleBet(address(this), bet.player, bet.wager, bet.wager); // full refund
        emit BetRefunded(requestId, bet.player, bet.wager);
    }

    // ─────────────────────────────────────────────
    // View / Verification
    // ─────────────────────────────────────────────

    /// @notice Get bet details by requestId (for provable fairness verification)
    function getBet(uint256 requestId) external view returns (Bet memory) {
        return bets[requestId];
    }

    /// @notice Get all bet IDs for a player
    function getPlayerBets(address player) external view returns (uint256[] memory) {
        return playerBets[player];
    }

    /// @notice Get the most recent N bets for a player
    function getRecentPlayerBets(address player, uint256 count)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] storage all = playerBets[player];
        uint256 len = all.length;
        uint256 retCount = count > len ? len : count;
        uint256[] memory result = new uint256[](retCount);
        for (uint256 i = 0; i < retCount; i++) {
            result[i] = all[len - retCount + i];
        }
        return result;
    }

    /// @notice Verify a settled bet outcome independently
    /// @return result The coin side determined by VRF
    /// @return won    Whether the player won
    function verifyBet(uint256 requestId)
        external
        view
        returns (Side result, bool won)
    {
        Bet memory bet = bets[requestId];
        require(bet.status != BetStatus.PENDING, "CoinFlip: not yet settled");
        require(bet.randomWord != 0, "CoinFlip: no randomWord");
        result = (bet.randomWord % 2 == 0) ? Side.HEADS : Side.TAILS;
        won = (result == bet.choice);
    }

    /// @notice Current payout multiplier in basis points (e.g. 19400 = 1.94x)
    function payoutMultiplierBps() external view returns (uint256) {
        return (payoutNumerator * 10000) / payoutDenominator;
    }

    // ─────────────────────────────────────────────
    // Owner Config
    // ─────────────────────────────────────────────

    function setSubscriptionId(uint256 _subId) external onlyOwner {
        subscriptionId = _subId;
    }

    function setHouseEdge(uint256 _edgeBps, uint256 _numerator, uint256 _denominator)
        external onlyOwner
    {
        require(_edgeBps <= 1000, "CoinFlip: edge too high (max 10%)");
        require(_denominator > 0, "CoinFlip: zero denominator");
        houseEdgeBps = _edgeBps;
        payoutNumerator = _numerator;
        payoutDenominator = _denominator;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
