// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./BaseGame.sol";

/// @title CoinFlip — BaseCast Provably Fair Coin Flip
/// @notice HEADS or TAILS. Win = 1.94× (3% house edge). Pyth Entropy v2.
contract CoinFlip is BaseGame {

    enum Side      { HEADS, TAILS }
    enum BetStatus { PENDING, WON, LOST }

    struct Bet {
        address   player;
        uint96    wager;
        Side      choice;
        BetStatus status;
        uint96    payout;
        uint32    timestamp;
        bytes32   randomSeed;
    }

    uint256 public payoutBps = 19_400; // 1.94×

    mapping(uint64 => Bet)       public bets;
    mapping(address => uint64[]) public playerBetIds;
    uint256 public totalBets;
    uint256 public totalWagered;

    // Constructor — no provider needed, Pyth v2 uses default automatically
    // _entropy Base Sepolia: 0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4C
    // _entropy Base Mainnet: 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DA
    constructor(address _vault, address _entropy)
        BaseGame(_vault, _entropy) {}

    /// @notice Place a coin flip bet
    /// @param wager  USDC amount (approve vault first)
    /// @param choice 0 = HEADS, 1 = TAILS
    /// @dev Send ETH equal to getEntropyFee() as msg.value
    function placeBet(uint256 wager, Side choice)
        external payable whenNotPaused nonReentrant returns (uint64 seqNum)
    {
        vault.receiveBet(msg.sender, wager);
        seqNum = _requestEntropy();

        bets[seqNum] = Bet({
            player:     msg.sender,
            wager:      uint96(wager),
            choice:     choice,
            status:     BetStatus.PENDING,
            payout:     0,
            timestamp:  uint32(block.timestamp),
            randomSeed: bytes32(0)
        });

        _pendingPlayer[seqNum] = msg.sender;
        playerBetIds[msg.sender].push(seqNum);
        unchecked { totalBets++; totalWagered += wager; }

        emit BetRequested(seqNum, msg.sender, wager);
    }

    function _resolveGame(uint64 seqNum, bytes32 randomNumber) internal override {
        Bet storage bet = bets[seqNum];
        bet.randomSeed  = randomNumber;

        // Even last byte = HEADS, Odd = TAILS
        Side result = (uint8(randomNumber[31]) & 1) == 0 ? Side.HEADS : Side.TAILS;
        bool won    = (result == bet.choice);
        uint256 payout = won ? (uint256(bet.wager) * payoutBps) / 10_000 : 0;

        bet.status = won ? BetStatus.WON : BetStatus.LOST;
        bet.payout = uint96(payout);

        vault.settleBet(bet.player, bet.wager, payout);
        emit BetResolved(seqNum, bet.player, bet.wager, payout, won);
    }

    function getBet(uint64 seqNum) external view returns (Bet memory) {
        return bets[seqNum];
    }

    function getPlayerBets(address player) external view returns (uint64[] memory) {
        return playerBetIds[player];
    }

    function verifyBet(uint64 seqNum) external view returns (Side result, bool won) {
        Bet memory bet = bets[seqNum];
        require(bet.status != BetStatus.PENDING, "Not settled");
        result = (uint8(bet.randomSeed[31]) & 1) == 0 ? Side.HEADS : Side.TAILS;
        won    = (result == bet.choice);
    }

    function setPayoutBps(uint256 _bps) external onlyOwner {
        require(_bps >= 15_000 && _bps <= 19_900, "Out of range");
        payoutBps = _bps;
    }
}
