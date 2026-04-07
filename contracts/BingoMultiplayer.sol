// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

/// @title  BingoMultiplayer v3 — BaseCast (Gas-Optimised)
/// @notice Three changes eliminate the callback gas-limit failure:
///         1. Cards are packed into a mapping at join time — no in-callback regen.
///         2. The Pyth callback only stores the seed (~30 k gas) and emits an event.
///         3. Anyone calls finalizeRound() in a separate tx; resolution uses
///            25-bit position bitmaps so pattern checks are single bitwise ops.

contract BingoMultiplayer is ReentrancyGuard, IEntropyConsumer {
    using SafeERC20 for IERC20;

    // ─── Immutables ───────────────────────────────────────────────────────────
    IEntropyV2 public immutable entropy;
    IERC20     public immutable usdc;
    address    public immutable vault;

    // ─── Owner ────────────────────────────────────────────────────────────────
    address public owner;
    bool    public paused;

    // ─── Game Modes / States ──────────────────────────────────────────────────
    enum GameMode   { CLASSIC, BLACKOUT, CORNERS, X_FACTOR }
    enum RoundState { WAITING, LOCKED, FINISHED, CANCELLED }

    // ─── 25-bit Position Bitmap Masks ─────────────────────────────────────────
    // Grid layout (index = bit position, row-major):
    //  0  1  2  3  4
    //  5  6  7  8  9
    // 10 11 12 13 14
    // 15 16 17 18 19
    // 20 21 22 23 24
    uint256 private constant ROW_0       = 0x0000001F;
    uint256 private constant ROW_1       = 0x000003E0;
    uint256 private constant ROW_2       = 0x00007C00;
    uint256 private constant ROW_3       = 0x000F8000;
    uint256 private constant ROW_4       = 0x01F00000;
    uint256 private constant COL_0       = (1<<0)|(1<<5)|(1<<10)|(1<<15)|(1<<20);
    uint256 private constant COL_1       = (1<<1)|(1<<6)|(1<<11)|(1<<16)|(1<<21);
    uint256 private constant COL_2       = (1<<2)|(1<<7)|(1<<12)|(1<<17)|(1<<22);
    uint256 private constant COL_3       = (1<<3)|(1<<8)|(1<<13)|(1<<18)|(1<<23);
    uint256 private constant COL_4       = (1<<4)|(1<<9)|(1<<14)|(1<<19)|(1<<24);
    uint256 private constant DIAG1       = (1<<0)|(1<<6)|(1<<12)|(1<<18)|(1<<24);
    uint256 private constant DIAG2       = (1<<4)|(1<<8)|(1<<12)|(1<<16)|(1<<20);
    uint256 private constant CORNERS_MSK = (1<<0)|(1<<4)|(1<<20)|(1<<24);
    uint256 private constant FULL_MSK    = (1<<25)-1;

    // ─── Structs ──────────────────────────────────────────────────────────────
    struct Round {
        uint256    entryFee;
        uint256    maxPlayers;
        uint256    timerDuration;
        uint256    startTime;
        uint256    prizePool;
        GameMode   mode;
        RoundState state;
        bytes32    randomSeed;       // Stored by lightweight callback
        uint8[]    drawnNumbers;     // Stored by finalizeRound
        address[]  players;
        address[]  winners;
        uint64     entropySeqNum;
        bool       entropyRequested;
        bool       seeded;           // True once callback received → ready to finalize
    }

    // ─── State ────────────────────────────────────────────────────────────────
    mapping(uint256 => Round)                       public  rounds;
    mapping(uint256 => mapping(address => bool))    public  hasJoined;
    // Packed card: 25 numbers × 7 bits each = 175 bits, stored in one uint256 slot
    mapping(uint256 => mapping(address => uint256)) public  playerCards;
    mapping(uint64  => uint256)                     private _seqToRound;

    uint256 public roundCount;
    uint256 public houseFunds;
    uint256 public constant HOUSE_CUT_BPS = 1000;
    uint256 public constant WINNER_BPS    = 9000;

    // ─── Events ───────────────────────────────────────────────────────────────
    event RoundCreated   (uint256 indexed roundId, uint256 entryFee, uint256 maxPlayers, uint256 timerDuration, GameMode mode);
    event PlayerJoined   (uint256 indexed roundId, address indexed player, uint256 playerCount);
    event RoundLocked    (uint256 indexed roundId, uint256 prizePool, uint256 playerCount);
    event EntropyReceived(uint256 indexed roundId, bytes32 seed);
    event NumbersDrawn   (uint256 indexed roundId, uint8[] drawnNumbers);
    event RoundFinished  (uint256 indexed roundId, address[] winners, uint256 payoutEach, uint256 houseCut);
    event RoundCancelled (uint256 indexed roundId, uint256 refundAmount);
    event HouseWithdrawn (uint256 amount);

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyOwner()              { require(msg.sender == owner, "Not owner"); _; }
    modifier whenNotPaused()          { require(!paused,             "Paused");    _; }
    modifier roundExists(uint256 id)  { require(id < roundCount,     "Not found"); _; }

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address _usdc, address _vault, address _entropy) {
        require(_usdc    != address(0), "Zero usdc");
        require(_vault   != address(0), "Zero vault");
        require(_entropy != address(0), "Zero entropy");
        usdc    = IERC20(_usdc);
        vault   = _vault;
        entropy = IEntropyV2(_entropy);
        owner   = msg.sender;
    }

    function getEntropy() internal view override returns (address) { return address(entropy); }

    // ─── Owner: Create Round ──────────────────────────────────────────────────
    function createRound(
        uint256  entryFee,
        uint256  maxPlayers,
        uint256  timerSeconds,
        GameMode mode
    ) external onlyOwner whenNotPaused {
        require(entryFee     >= 100_000, "Min entry $0.10");
        require(maxPlayers   >= 2,       "Min 2 players");
        require(maxPlayers   <= 100,     "Max 100 players");
        require(timerSeconds >= 30,      "Min 30s timer");
        require(timerSeconds <= 3600,    "Max 1hr timer");

        uint256 id = roundCount++;
        Round storage r = rounds[id];
        r.entryFee      = entryFee;
        r.maxPlayers    = maxPlayers;
        r.timerDuration = timerSeconds;
        r.mode          = mode;
        r.state         = RoundState.WAITING;

        emit RoundCreated(id, entryFee, maxPlayers, timerSeconds, mode);
    }

    // ─── Player: Join Round ───────────────────────────────────────────────────
    /// @notice Pay entry fee and receive a unique bingo card stored on-chain.
    ///         The card is generated immediately — players can see it before the draw.
    function joinRound(uint256 roundId)
        external nonReentrant whenNotPaused roundExists(roundId)
    {
        Round storage r = rounds[roundId];
        require(r.state == RoundState.WAITING,   "Round not open");
        require(!hasJoined[roundId][msg.sender],  "Already joined");
        require(r.players.length < r.maxPlayers,  "Round full");

        if (r.players.length > 0) {
            require(block.timestamp < r.startTime + r.timerDuration, "Timer expired");
        }

        usdc.safeTransferFrom(msg.sender, address(this), r.entryFee);

        if (r.players.length == 0) r.startTime = block.timestamp;

        // Generate card from roundId + join-order index + address, store packed
        playerCards[roundId][msg.sender] = _generatePackedCard(
            roundId,
            r.players.length,
            msg.sender
        );

        hasJoined[roundId][msg.sender] = true;
        r.players.push(msg.sender);
        r.prizePool += r.entryFee;

        emit PlayerJoined(roundId, msg.sender, r.players.length);

        if (r.players.length == r.maxPlayers) _lockAndDraw(roundId);
    }

    // ─── Lock Round ───────────────────────────────────────────────────────────
    function lockRound(uint256 roundId)
        external nonReentrant roundExists(roundId)
    {
        Round storage r = rounds[roundId];
        require(r.state == RoundState.WAITING, "Not waiting");
        require(r.players.length > 0,          "No players");

        bool timerExpired = block.timestamp >= r.startTime + r.timerDuration;
        require(timerExpired || msg.sender == owner, "Timer not expired");

        if (r.players.length < 2) { _cancelRound(roundId); return; }

        _lockAndDraw(roundId);
    }

    // ─── Internal: Request Entropy ────────────────────────────────────────────
    function _lockAndDraw(uint256 roundId) internal {
        Round storage r = rounds[roundId];
        r.state = RoundState.LOCKED;
        emit RoundLocked(roundId, r.prizePool, r.players.length);

        uint256 fee = entropy.getFeeV2();
        require(address(this).balance >= fee, "Insufficient ETH for Pyth");

        uint64 seqNum = entropy.requestV2{value: fee}();
        r.entropySeqNum    = seqNum;
        r.entropyRequested = true;
        _seqToRound[seqNum] = roundId;
    }

    // ─── Pyth Callback — LIGHTWEIGHT (~30 k gas, never hits gas cap) ──────────
    /// @dev Only stores the seed and flips `seeded`. All heavy work is in finalizeRound.
    function entropyCallback(
        uint64  seqNum,
        address,
        bytes32 randomNumber
    ) internal override {
        uint256 roundId = _seqToRound[seqNum];
        Round storage r = rounds[roundId];
        require(r.state == RoundState.LOCKED, "Not locked");

        r.randomSeed = randomNumber;
        r.seeded     = true;

        emit EntropyReceived(roundId, randomNumber);
    }

    // ─── Finalize Round (anyone can call after entropy arrives) ───────────────
    /// @notice Draws numbers from the Pyth seed and resolves winners.
    ///         Separated from the callback so it runs with sufficient gas.
    function finalizeRound(uint256 roundId)
        external nonReentrant roundExists(roundId)
    {
        Round storage r = rounds[roundId];
        require(r.state == RoundState.LOCKED, "Not locked");
        require(r.seeded,                     "Entropy not received yet");

        r.drawnNumbers = _drawNumbers(r.randomSeed);
        emit NumbersDrawn(roundId, r.drawnNumbers);

        _resolveRound(roundId);
    }

    // ─── Winner Resolution (bitmap-based) ─────────────────────────────────────
    /// @dev Cost: O(75 reveals × N players × 25 positions) — no keccak in inner loop.
    ///      Pattern checks are single bitwise AND operations.
    function _resolveRound(uint256 roundId) internal {
        Round storage r     = rounds[roundId];
        uint256 numPlayers  = r.players.length;

        // Unpack every player's card once upfront
        uint8[][] memory cards = new uint8[][](numPlayers);
        for (uint256 p; p < numPlayers;) {
            uint256 packed = playerCards[roundId][r.players[p]];
            cards[p] = new uint8[](25);
            for (uint8 i; i < 25;) {
                cards[p][i] = uint8((packed >> (i * 7)) & 0x7F);
                unchecked { i++; }
            }
            unchecked { p++; }
        }

        // One 25-bit matched-position mask per player
        uint256[] memory posMasks = new uint256[](numPlayers);
        address[] memory potWinners = new address[](numPlayers);
        uint256 winnerCount;

        // Progressive reveal — stops as soon as any player wins
        for (uint256 reveal; reveal < 75;) {
            uint8 num = r.drawnNumbers[reveal];

            // Update matched-position masks
            for (uint256 p; p < numPlayers;) {
                for (uint8 pos; pos < 25;) {
                    if (cards[p][pos] == num) {
                        posMasks[p] |= (1 << pos);
                        break;
                    }
                    unchecked { pos++; }
                }
                unchecked { p++; }
            }

            // Check all players for winning pattern (O(1) per player via bitmap)
            for (uint256 p; p < numPlayers;) {
                if (_checkPatternBitmap(posMasks[p], r.mode)) {
                    potWinners[winnerCount++] = r.players[p];
                }
                unchecked { p++; }
            }

            if (winnerCount > 0) break;
            unchecked { reveal++; }
        }

        if (winnerCount > 0) {
            for (uint256 i; i < winnerCount;) {
                r.winners.push(potWinners[i]);
                unchecked { i++; }
            }

            uint256 houseCut   = (r.prizePool * HOUSE_CUT_BPS) / 10_000;
            uint256 winnerPool = r.prizePool - houseCut;
            uint256 payoutEach = winnerPool / winnerCount;

            for (uint256 i; i < winnerCount;) {
                usdc.safeTransfer(potWinners[i], payoutEach);
                unchecked { i++; }
            }

            houseFunds += houseCut;
            r.state = RoundState.FINISHED;
            emit RoundFinished(roundId, r.winners, payoutEach, houseCut);
        } else {
            _cancelRound(roundId);
        }
    }

    // ─── Bitmap Pattern Check — O(1) ──────────────────────────────────────────
    function _checkPatternBitmap(uint256 mask, GameMode mode)
        internal pure returns (bool)
    {
        if (mode == GameMode.CLASSIC) {
            return (mask & ROW_0 == ROW_0) || (mask & ROW_1 == ROW_1) ||
                   (mask & ROW_2 == ROW_2) || (mask & ROW_3 == ROW_3) ||
                   (mask & ROW_4 == ROW_4) ||
                   (mask & COL_0 == COL_0) || (mask & COL_1 == COL_1) ||
                   (mask & COL_2 == COL_2) || (mask & COL_3 == COL_3) ||
                   (mask & COL_4 == COL_4) ||
                   (mask & DIAG1 == DIAG1) || (mask & DIAG2 == DIAG2);
        }
        if (mode == GameMode.BLACKOUT) return mask & FULL_MSK    == FULL_MSK;
        if (mode == GameMode.CORNERS)  return mask & CORNERS_MSK == CORNERS_MSK;
        if (mode == GameMode.X_FACTOR) return (mask & DIAG1 == DIAG1) && (mask & DIAG2 == DIAG2);
        return false;
    }

    // ─── Card Generation ──────────────────────────────────────────────────────
    /// @dev Fisher-Yates on 1–75, take first 25, pack into uint256 (7 bits × 25).
    ///      Unique per (roundId, join-order, player address).
    function _generatePackedCard(uint256 roundId, uint256 playerIndex, address player)
        internal pure returns (uint256 packed)
    {
        bytes32 seed = keccak256(abi.encode(roundId, playerIndex, player, "basecast-bingo-v3"));
        uint8[75] memory pool;
        for (uint8 i; i < 75;) { pool[i] = i + 1; unchecked { i++; } }
        for (uint8 i = 74; i > 0;) {
            uint8 j = uint8(uint256(keccak256(abi.encode(seed, i))) % (i + 1));
            (pool[i], pool[j]) = (pool[j], pool[i]);
            unchecked { i--; }
        }
        for (uint8 i; i < 25;) {
            packed |= uint256(pool[i]) << (i * 7);
            unchecked { i++; }
        }
    }

    // ─── Number Draw ──────────────────────────────────────────────────────────
    function _drawNumbers(bytes32 seed) internal pure returns (uint8[] memory drawn) {
        bytes32 drawSeed = keccak256(abi.encode(seed, "draw"));
        uint8[75] memory pool;
        for (uint8 i; i < 75;) { pool[i] = i + 1; unchecked { i++; } }
        for (uint8 i = 74; i > 0;) {
            uint8 j = uint8(uint256(keccak256(abi.encode(drawSeed, i))) % (i + 1));
            (pool[i], pool[j]) = (pool[j], pool[i]);
            unchecked { i--; }
        }
        drawn = new uint8[](75);
        for (uint8 i; i < 75;) { drawn[i] = pool[i]; unchecked { i++; } }
    }

    // ─── Cancel ───────────────────────────────────────────────────────────────
    function _cancelRound(uint256 roundId) internal {
        Round storage r = rounds[roundId];
        r.state = RoundState.CANCELLED;
        uint256 amt = r.entryFee;
        for (uint256 i; i < r.players.length;) {
            usdc.safeTransfer(r.players[i], amt);
            unchecked { i++; }
        }
        emit RoundCancelled(roundId, amt);
    }

    // ─── Owner: Withdraw ──────────────────────────────────────────────────────
    function withdrawHouseFunds() external onlyOwner nonReentrant {
        uint256 amt = houseFunds;
        require(amt > 0, "Nothing to withdraw");
        houseFunds = 0;
        usdc.safeTransfer(owner, amt);
        emit HouseWithdrawn(amt);
    }

    function withdrawHouseFunds(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= houseFunds, "Exceeds house funds");
        houseFunds -= amount;
        usdc.safeTransfer(owner, amount);
        emit HouseWithdrawn(amount);
    }

    function emergencyCancel(uint256 roundId) external onlyOwner roundExists(roundId) {
        Round storage r = rounds[roundId];
        require(r.state == RoundState.WAITING || r.state == RoundState.LOCKED, "Cannot cancel");
        _cancelRound(roundId);
    }

    function setPaused(bool _p) external onlyOwner { paused = _p; }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero");
        owner = newOwner;
    }

    // ─── View Functions ───────────────────────────────────────────────────────
    function getRound(uint256 roundId) external view returns (
        uint256    entryFee,
        uint256    maxPlayers,
        uint256    timerDuration,
        uint256    startTime,
        uint256    prizePool,
        GameMode   mode,
        RoundState state,
        uint256    playerCount,
        address[]  memory winners,
        bool       seeded
    ) {
        Round storage r = rounds[roundId];
        return (
            r.entryFee, r.maxPlayers, r.timerDuration,
            r.startTime, r.prizePool, r.mode, r.state,
            r.players.length, r.winners, r.seeded
        );
    }

    /// @notice Returns a player's bingo card. Available immediately after joining —
    ///         players can see their card before the round locks.
    function getPlayerCard(uint256 roundId, address player)
        external view returns (uint8[25] memory card)
    {
        require(hasJoined[roundId][player], "Player has not joined this round");
        uint256 packed = playerCards[roundId][player];
        for (uint8 i; i < 25;) {
            card[i] = uint8((packed >> (i * 7)) & 0x7F);
            unchecked { i++; }
        }
    }

    function getPlayers(uint256 roundId) external view returns (address[] memory) {
        return rounds[roundId].players;
    }

    function getDrawnNumbers(uint256 roundId) external view returns (uint8[] memory) {
        return rounds[roundId].drawnNumbers;
    }

    function getOpenRounds() external view returns (uint256[] memory) {
        uint256 count;
        for (uint256 i; i < roundCount;) {
            if (rounds[i].state == RoundState.WAITING) count++;
            unchecked { i++; }
        }
        uint256[] memory open = new uint256[](count);
        uint256 idx;
        for (uint256 i; i < roundCount;) {
            if (rounds[i].state == RoundState.WAITING) open[idx++] = i;
            unchecked { i++; }
        }
        return open;
    }

    function timeUntilLock(uint256 roundId) external view returns (uint256) {
        Round storage r = rounds[roundId];
        if (r.state != RoundState.WAITING || r.players.length == 0) return 0;
        uint256 lockAt = r.startTime + r.timerDuration;
        if (block.timestamp >= lockAt) return 0;
        return lockAt - block.timestamp;
    }

    function getEntropyFee() external view returns (uint256) { return entropy.getFeeV2(); }

    receive() external payable {}

    function withdrawEth(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient ETH");
        (bool ok,) = owner.call{value: amount}("");
        require(ok, "ETH transfer failed");
    }
}
