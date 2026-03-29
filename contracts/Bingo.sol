// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./BaseGame.sol";

/// @title Bingo — BaseCast Provably Fair Bingo
/// @notice Three modes: TURBO (3x3), SPEED (5x5 first line), PATTERN (5x5 chosen pattern)
/// @dev Inherits BaseGame for Pyth Entropy v2 integration
contract Bingo is BaseGame {

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum GameMode {
        TURBO,    // 3x3 grid, 9 numbers, any line wins 3x
        SPEED,    // 5x5 grid, first line wins 2.5x, full card wins 20x
        PATTERN   // 5x5 grid, player picks pattern, higher multiplier
    }

    enum Pattern {
        ANY_LINE,   // any row, column, or diagonal
        X_SHAPE,    // both diagonals
        CORNERS,    // four corners
        T_SHAPE,    // top row + middle column
        FULL_CARD   // all 25 numbers (blackout)
    }

    enum BetStatus { PENDING, WON, LOST }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Bet {
        address   player;
        uint96    wager;
        GameMode  mode;
        Pattern   pattern;      // only used in PATTERN mode
        BetStatus status;
        uint96    payout;
        uint32    timestamp;
        bytes32   randomSeed;   // stored for provable fairness
        uint8     gridSize;     // 3 for TURBO, 5 for SPEED/PATTERN
    }

    // ─── Payout Config ────────────────────────────────────────────────────────
    // All in basis points (10000 = 1x)

    // TURBO payouts
    uint256 public turboLineBps    = 29_000;  // 2.9× any line
    uint256 public turboFullBps    = 80_000;  // 8× full card

    // SPEED payouts
    uint256 public speedLineBps    = 24_000;  // 2.4× first line
    uint256 public speedFullBps   = 180_000;  // 18× full card

    // PATTERN payouts
    uint256 public patternAnyLineBps  = 24_000;  // 2.4×
    uint256 public patternXBps        = 45_000;  // 4.5×
    uint256 public patternCornersBps  = 35_000;  // 3.5×
    uint256 public patternTBps        = 38_000;  // 3.8×
    uint256 public patternFullBps    = 200_000;  // 20×

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(uint64 => Bet)       public bets;
    mapping(address => uint64[]) public playerBetIds;

    uint256 public totalBets;
    uint256 public totalWagered;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BingoBetPlaced(
        uint64  indexed seqNum,
        address indexed player,
        uint256 wager,
        GameMode mode,
        Pattern  pattern
    );

    event BingoResult(
        uint64  indexed seqNum,
        address indexed player,
        uint256 wager,
        uint256 payout,
        bool    won,
        GameMode mode,
        uint8[] drawnNumbers,
        uint8[] card
    );

    // ─── Constructor ──────────────────────────────────────────────────────────
    // _entropy Base Sepolia: 0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4C
    // _entropy Base Mainnet: 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DA
    constructor(address _vault, address _entropy)
        BaseGame(_vault, _entropy) {}

    // ─── Place Bet ────────────────────────────────────────────────────────────

    /// @notice Place a TURBO bingo bet (3x3 grid)
    /// @dev Send ETH = getEntropyFee() as msg.value
    function placeTurbo(uint256 wager)
        external payable whenNotPaused nonReentrant returns (uint64)
    {
        return _place(wager, GameMode.TURBO, Pattern.ANY_LINE);
    }

    /// @notice Place a SPEED bingo bet (5x5 grid, first line or full card)
    function placeSpeed(uint256 wager)
        external payable whenNotPaused nonReentrant returns (uint64)
    {
        return _place(wager, GameMode.SPEED, Pattern.ANY_LINE);
    }

    /// @notice Place a PATTERN bingo bet (5x5 grid, choose your pattern)
    /// @param pattern 0=ANY_LINE 1=X_SHAPE 2=CORNERS 3=T_SHAPE 4=FULL_CARD
    function placePattern(uint256 wager, Pattern pattern)
        external payable whenNotPaused nonReentrant returns (uint64)
    {
        return _place(wager, GameMode.PATTERN, pattern);
    }

    function _place(uint256 wager, GameMode mode, Pattern pattern)
        internal returns (uint64 seqNum)
    {
        vault.receiveBet(msg.sender, wager);
        seqNum = _requestEntropy();

        bets[seqNum] = Bet({
            player:     msg.sender,
            wager:      uint96(wager),
            mode:       mode,
            pattern:    pattern,
            status:     BetStatus.PENDING,
            payout:     0,
            timestamp:  uint32(block.timestamp),
            randomSeed: bytes32(0),
            gridSize:   mode == GameMode.TURBO ? 3 : 5
        });

        _pendingPlayer[seqNum] = msg.sender;
        playerBetIds[msg.sender].push(seqNum);
        unchecked { totalBets++; totalWagered += wager; }

        emit BingoBetPlaced(seqNum, msg.sender, wager, mode, pattern);
        emit BetRequested(seqNum, msg.sender, wager);
    }

    // ─── Resolve ──────────────────────────────────────────────────────────────

    function _resolveGame(uint64 seqNum, bytes32 randomNumber) internal override {
        Bet storage bet = bets[seqNum];
        bet.randomSeed  = randomNumber;

        if (bet.mode == GameMode.TURBO) {
            _resolveTurbo(seqNum, bet, randomNumber);
        } else if (bet.mode == GameMode.SPEED) {
            _resolveSpeed(seqNum, bet, randomNumber);
        } else {
            _resolvePattern(seqNum, bet, randomNumber);
        }
    }

    // ── TURBO: 3x3 grid ───────────────────────────────────────────────────────
    function _resolveTurbo(uint64 seqNum, Bet storage bet, bytes32 seed) internal {
        // Generate 3x3 card (numbers 1-27) and draw 9 numbers from same seed
        uint8[9] memory card    = _generateCard3x3(seed);
        uint8[9] memory drawn   = _drawNumbers3x3(seed);
        bool[9]  memory matched = _matchNumbers(card, drawn, 9);

        bool won;
        uint256 payoutBps;

        // Check full card first (higher payout)
        if (_checkFull(matched, 9)) {
            won = true;
            payoutBps = turboFullBps;
        } else if (_checkLine3x3(matched)) {
            won = true;
            payoutBps = turboLineBps;
        }

        uint256 payout = won ? (uint256(bet.wager) * payoutBps) / 10_000 : 0;
        bet.status = won ? BetStatus.WON : BetStatus.LOST;
        bet.payout = uint96(payout);

        vault.settleBet(bet.player, bet.wager, payout);

        // Convert for event
        uint8[] memory cardArr  = new uint8[](9);
        uint8[] memory drawnArr = new uint8[](9);
        for (uint8 i; i < 9;) { cardArr[i]=card[i]; drawnArr[i]=drawn[i]; unchecked{i++;} }

        emit BingoResult(seqNum, bet.player, bet.wager, payout, won, bet.mode, drawnArr, cardArr);
        emit BetResolved(seqNum, bet.player, bet.wager, payout, won);
    }

    // ── SPEED: 5x5 grid ───────────────────────────────────────────────────────
    function _resolveSpeed(uint64 seqNum, Bet storage bet, bytes32 seed) internal {
        uint8[25] memory card    = _generateCard5x5(seed);
        uint8[25] memory drawn   = _drawNumbers5x5(seed);
        bool[25]  memory matched = _matchNumbers25(card, drawn);

        bool won;
        uint256 payoutBps;

        if (_checkFull(matched, 25)) {
            won = true;
            payoutBps = speedFullBps;
        } else if (_checkLine5x5(matched)) {
            won = true;
            payoutBps = speedLineBps;
        }

        uint256 payout = won ? (uint256(bet.wager) * payoutBps) / 10_000 : 0;
        bet.status = won ? BetStatus.WON : BetStatus.LOST;
        bet.payout = uint96(payout);

        vault.settleBet(bet.player, bet.wager, payout);

        uint8[] memory cardArr  = new uint8[](25);
        uint8[] memory drawnArr = new uint8[](25);
        for (uint8 i; i < 25;) { cardArr[i]=card[i]; drawnArr[i]=drawn[i]; unchecked{i++;} }

        emit BingoResult(seqNum, bet.player, bet.wager, payout, won, bet.mode, drawnArr, cardArr);
        emit BetResolved(seqNum, bet.player, bet.wager, payout, won);
    }

    // ── PATTERN: 5x5 with chosen pattern ─────────────────────────────────────
    function _resolvePattern(uint64 seqNum, Bet storage bet, bytes32 seed) internal {
        uint8[25] memory card    = _generateCard5x5(seed);
        uint8[25] memory drawn   = _drawNumbers5x5(seed);
        bool[25]  memory matched = _matchNumbers25(card, drawn);

        bool won = _checkPattern(matched, bet.pattern);

        uint256 payoutBps;
        if (won) {
            if      (bet.pattern == Pattern.ANY_LINE)  payoutBps = patternAnyLineBps;
            else if (bet.pattern == Pattern.X_SHAPE)   payoutBps = patternXBps;
            else if (bet.pattern == Pattern.CORNERS)   payoutBps = patternCornersBps;
            else if (bet.pattern == Pattern.T_SHAPE)   payoutBps = patternTBps;
            else                                       payoutBps = patternFullBps;
        }

        uint256 payout = won ? (uint256(bet.wager) * payoutBps) / 10_000 : 0;
        bet.status = won ? BetStatus.WON : BetStatus.LOST;
        bet.payout = uint96(payout);

        vault.settleBet(bet.player, bet.wager, payout);

        uint8[] memory cardArr  = new uint8[](25);
        uint8[] memory drawnArr = new uint8[](25);
        for (uint8 i; i < 25;) { cardArr[i]=card[i]; drawnArr[i]=drawn[i]; unchecked{i++;} }

        emit BingoResult(seqNum, bet.player, bet.wager, payout, won, bet.mode, drawnArr, cardArr);
        emit BetResolved(seqNum, bet.player, bet.wager, payout, won);
    }

    // ─── Card + Draw Generation ───────────────────────────────────────────────

    /// @dev Generate a 3x3 bingo card (unique numbers 1-27)
    function _generateCard3x3(bytes32 seed) internal pure returns (uint8[9] memory card) {
        uint8[27] memory pool;
        for (uint8 i; i < 27;) { pool[i] = i + 1; unchecked{i++;} }
        // Fisher-Yates shuffle using seed bytes for card generation
        for (uint8 i = 26; i > 0;) {
            uint8 j = uint8(uint256(keccak256(abi.encode(seed, "card3", i))) % (i + 1));
            (pool[i], pool[j]) = (pool[j], pool[i]);
            unchecked{i--;}
        }
        for (uint8 i; i < 9;) { card[i] = pool[i]; unchecked{i++;} }
    }

    /// @dev Draw 9 numbers (the "called" numbers) for 3x3
    function _drawNumbers3x3(bytes32 seed) internal pure returns (uint8[9] memory drawn) {
        uint8[27] memory pool;
        for (uint8 i; i < 27;) { pool[i] = i + 1; unchecked{i++;} }
        for (uint8 i = 26; i > 0;) {
            uint8 j = uint8(uint256(keccak256(abi.encode(seed, "draw3", i))) % (i + 1));
            (pool[i], pool[j]) = (pool[j], pool[i]);
            unchecked{i--;}
        }
        // Draw first 15 out of 27 (fair odds)
        for (uint8 i; i < 9;) { drawn[i] = pool[i]; unchecked{i++;} }
    }

    /// @dev Generate a 5x5 bingo card (unique numbers 1-75)
    function _generateCard5x5(bytes32 seed) internal pure returns (uint8[25] memory card) {
        uint8[75] memory pool;
        for (uint8 i; i < 75;) { pool[i] = i + 1; unchecked{i++;} }
        for (uint8 i = 74; i > 0;) {
            uint8 j = uint8(uint256(keccak256(abi.encode(seed, "card5", i))) % (i + 1));
            (pool[i], pool[j]) = (pool[j], pool[i]);
            unchecked{i--;}
        }
        for (uint8 i; i < 25;) { card[i] = pool[i]; unchecked{i++;} }
    }

    /// @dev Draw 40 numbers out of 75 for 5x5 (good win rate balance)
    function _drawNumbers5x5(bytes32 seed) internal pure returns (uint8[25] memory drawn) {
        uint8[75] memory pool;
        for (uint8 i; i < 75;) { pool[i] = i + 1; unchecked{i++;} }
        for (uint8 i = 74; i > 0;) {
            uint8 j = uint8(uint256(keccak256(abi.encode(seed, "draw5", i))) % (i + 1));
            (pool[i], pool[j]) = (pool[j], pool[i]);
            unchecked{i--;}
        }
        // Return first 25 drawn numbers (used for matching)
        for (uint8 i; i < 25;) { drawn[i] = pool[i]; unchecked{i++;} }
    }

    // ─── Match Helpers ────────────────────────────────────────────────────────

    function _matchNumbers(uint8[9] memory card, uint8[9] memory drawn, uint8 size)
        internal pure returns (bool[9] memory matched)
    {
        for (uint8 i; i < size;) {
            for (uint8 j; j < size;) {
                if (card[i] == drawn[j]) { matched[i] = true; break; }
                unchecked{j++;}
            }
            unchecked{i++;}
        }
    }

    function _matchNumbers25(uint8[25] memory card, uint8[25] memory drawn)
        internal pure returns (bool[25] memory matched)
    {
        for (uint8 i; i < 25;) {
            for (uint8 j; j < 25;) {
                if (card[i] == drawn[j]) { matched[i] = true; break; }
                unchecked{j++;}
            }
            unchecked{i++;}
        }
    }

    // ─── Win Condition Checkers ───────────────────────────────────────────────

    function _checkFull(bool[9] memory m, uint8 size) internal pure returns (bool) {
        for (uint8 i; i < size;) { if (!m[i]) return false; unchecked{i++;} }
        return true;
    }

    // Overload for 25-cell
    function _checkFull(bool[25] memory m, uint8 size) internal pure returns (bool) {
        for (uint8 i; i < size;) { if (!m[i]) return false; unchecked{i++;} }
        return true;
    }

    /// @dev 3x3 line check — rows, cols, diagonals
    function _checkLine3x3(bool[9] memory m) internal pure returns (bool) {
        // Rows
        if (m[0]&&m[1]&&m[2]) return true;
        if (m[3]&&m[4]&&m[5]) return true;
        if (m[6]&&m[7]&&m[8]) return true;
        // Cols
        if (m[0]&&m[3]&&m[6]) return true;
        if (m[1]&&m[4]&&m[7]) return true;
        if (m[2]&&m[5]&&m[8]) return true;
        // Diagonals
        if (m[0]&&m[4]&&m[8]) return true;
        if (m[2]&&m[4]&&m[6]) return true;
        return false;
    }

    /// @dev 5x5 line check — rows, cols, diagonals
    function _checkLine5x5(bool[25] memory m) internal pure returns (bool) {
        // Rows
        for (uint8 r; r < 5;) {
            uint8 b = r * 5;
            if (m[b]&&m[b+1]&&m[b+2]&&m[b+3]&&m[b+4]) return true;
            unchecked{r++;}
        }
        // Cols
        for (uint8 c; c < 5;) {
            if (m[c]&&m[c+5]&&m[c+10]&&m[c+15]&&m[c+20]) return true;
            unchecked{c++;}
        }
        // Diagonals
        if (m[0]&&m[6]&&m[12]&&m[18]&&m[24]) return true;
        if (m[4]&&m[8]&&m[12]&&m[16]&&m[20]) return true;
        return false;
    }

    /// @dev Pattern-based win check for 5x5
    function _checkPattern(bool[25] memory m, Pattern p) internal pure returns (bool) {
        if (p == Pattern.ANY_LINE)  return _checkLine5x5(m);
        if (p == Pattern.X_SHAPE)  return m[0]&&m[6]&&m[12]&&m[18]&&m[24]&&m[4]&&m[8]&&m[16]&&m[20];
        if (p == Pattern.CORNERS)  return m[0]&&m[4]&&m[20]&&m[24];
        if (p == Pattern.T_SHAPE)  return m[0]&&m[1]&&m[2]&&m[3]&&m[4]&&m[2]&&m[7]&&m[12]&&m[17]&&m[22];
        if (p == Pattern.FULL_CARD)return _checkFull(m, 25);
        return false;
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getBet(uint64 seqNum) external view returns (Bet memory) {
        return bets[seqNum];
    }

    function getPlayerBets(address player) external view returns (uint64[] memory) {
        return playerBetIds[player];
    }

    /// @notice Get the card numbers for any bet (for frontend display)
    function getCard(uint64 seqNum) external view returns (uint8[] memory card) {
        Bet memory bet = bets[seqNum];
        require(bet.player != address(0), "Unknown bet");
        if (bet.gridSize == 3) {
            uint8[9] memory c = _generateCard3x3(bet.randomSeed);
            card = new uint8[](9);
            for (uint8 i; i < 9;) { card[i] = c[i]; unchecked{i++;} }
        } else {
            uint8[25] memory c = _generateCard5x5(bet.randomSeed);
            card = new uint8[](25);
            for (uint8 i; i < 25;) { card[i] = c[i]; unchecked{i++;} }
        }
    }

    /// @notice Verify any settled bet independently
    function verifyBet(uint64 seqNum) external view returns (bool won, uint256 payout) {
        Bet memory bet = bets[seqNum];
        require(bet.status != BetStatus.PENDING, "Not settled");
        won    = bet.status == BetStatus.WON;
        payout = bet.payout;
    }

    // ─── Owner Config ─────────────────────────────────────────────────────────

    function setTurboPayouts(uint256 lineBps, uint256 fullBps) external onlyOwner {
        turboLineBps = lineBps;
        turboFullBps = fullBps;
    }

    function setSpeedPayouts(uint256 lineBps, uint256 fullBps) external onlyOwner {
        speedLineBps = lineBps;
        speedFullBps = fullBps;
    }

    function setPatternPayouts(
        uint256 anyLine, uint256 x, uint256 corners,
        uint256 t, uint256 full
    ) external onlyOwner {
        patternAnyLineBps = anyLine;
        patternXBps       = x;
        patternCornersBps = corners;
        patternTBps       = t;
        patternFullBps    = full;
    }
}
