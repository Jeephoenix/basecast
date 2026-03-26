// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./BaseGame.sol";

/// @title DiceRoll — BaseCast Provably Fair Dice (Pyth Entropy v2)
/// @notice Range LOW/HIGH (1.94×) or Exact number (5.82×). 3% house edge.
contract DiceRoll is BaseGame {

    enum BetType   { RANGE_LOW, RANGE_HIGH, EXACT }
    enum BetStatus { PENDING, WON, LOST }

    struct Bet {
        address   player;
        uint96    wager;
        BetType   betType;
        uint8     exactNumber;
        BetStatus status;
        uint8     rolledNumber;
        uint96    payout;
        uint32    timestamp;
        bytes32   randomSeed;
    }

    uint256 public rangePayoutBps = 19_400; // 1.94×
    uint256 public exactPayoutBps = 58_200; // 5.82×

    mapping(uint64 => Bet)       public bets;
    mapping(address => uint64[]) public playerBetIds;
    uint256 public totalBets;
    uint256 public totalWagered;

    constructor(address _vault, address _entropy, address _provider)
        BaseGame(_vault, _entropy, _provider) {}

    /// @notice Bet LOW (1-3) or HIGH (4-6). Send ETH to cover Pyth fee.
    function placeBetRange(uint256 wager, bool high, bytes32 userRandom)
        external payable whenNotPaused nonReentrant returns (uint64)
    {
        return _place(wager, high ? BetType.RANGE_HIGH : BetType.RANGE_LOW, 0, userRandom);
    }

    /// @notice Bet on exact number 1-6. Send ETH to cover Pyth fee.
    function placeBetExact(uint256 wager, uint8 number, bytes32 userRandom)
        external payable whenNotPaused nonReentrant returns (uint64)
    {
        require(number >= 1 && number <= 6, "Invalid number");
        return _place(wager, BetType.EXACT, number, userRandom);
    }

    function _place(uint256 wager, BetType betType, uint8 exactNumber, bytes32 userRandom)
        internal returns (uint64 seqNum)
    {
        vault.receiveBet(msg.sender, wager);
        seqNum = _requestEntropy(userRandom);

        bets[seqNum] = Bet({
            player:       msg.sender,
            wager:        uint96(wager),
            betType:      betType,
            exactNumber:  exactNumber,
            status:       BetStatus.PENDING,
            rolledNumber: 0,
            payout:       0,
            timestamp:    uint32(block.timestamp),
            randomSeed:   bytes32(0)
        });

        _pendingPlayer[seqNum] = msg.sender;
        playerBetIds[msg.sender].push(seqNum);
        unchecked { totalBets++; totalWagered += wager; }

        emit BetRequested(seqNum, msg.sender, wager);
    }

    function _resolveGame(uint64 seqNum, bytes32 randomNumber) internal override {
        Bet storage bet    = bets[seqNum];
        bet.randomSeed     = randomNumber;
        uint8 rolled       = uint8(uint256(randomNumber) % 6) + 1;
        bet.rolledNumber   = rolled;

        bool    won;
        uint256 payoutBps;
        if      (bet.betType == BetType.RANGE_LOW)  { won = rolled <= 3; payoutBps = rangePayoutBps; }
        else if (bet.betType == BetType.RANGE_HIGH) { won = rolled >= 4; payoutBps = rangePayoutBps; }
        else                                         { won = rolled == bet.exactNumber; payoutBps = exactPayoutBps; }

        uint256 payout = won ? (uint256(bet.wager) * payoutBps) / 10_000 : 0;
        bet.status = won ? BetStatus.WON : BetStatus.LOST;
        bet.payout = uint96(payout);

        vault.settleBet(bet.player, bet.wager, payout);
        emit BetResolved(seqNum, bet.player, bet.wager, payout, won);
    }

    function getBet(uint64 seqNum) external view returns (Bet memory) { return bets[seqNum]; }
    function getPlayerBets(address player) external view returns (uint64[] memory) { return playerBetIds[player]; }

    function verifyBet(uint64 seqNum) external view returns (uint8 rolled, bool won) {
        Bet memory bet = bets[seqNum];
        require(bet.status != BetStatus.PENDING, "Not settled");
        rolled = uint8(uint256(bet.randomSeed) % 6) + 1;
        if      (bet.betType == BetType.RANGE_LOW)  won = rolled <= 3;
        else if (bet.betType == BetType.RANGE_HIGH) won = rolled >= 4;
        else                                         won = rolled == bet.exactNumber;
    }

    function setRangePayoutBps(uint256 _bps) external onlyOwner { require(_bps >= 15_000 && _bps <= 19_900, "Range"); rangePayoutBps = _bps; }
    function setExactPayoutBps(uint256 _bps) external onlyOwner { require(_bps >= 50_000 && _bps <= 59_000, "Range"); exactPayoutBps = _bps; }
}
