// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

/// @title BingoMultiplayer — BaseCast Provably Fair Multiplayer Bingo
/// @notice Self-contained multiplayer bingo. Handles USDC internally.
/// @dev Zero changes needed to GameVault, Bingo, or any other contract.

contract BingoMultiplayer is ReentrancyGuard, IEntropyConsumer {
    using SafeERC20 for IERC20;

    // ─── Pyth Entropy ─────────────────────────────────────────────────────────
    // Base Sepolia: 0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4C
    // Base Mainnet: 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DA
    IEntropyV2 public immutable entropy;

    // ─── USDC ─────────────────────────────────────────────────────────────────
    // Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
    // Base Mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    IERC20 public immutable usdc;

    // ─── GameVault (receives 10% house cut) ───────────────────────────────────
    address public immutable vault;

    // ─── Owner ────────────────────────────────────────────────────────────────
    address public owner;
    bool    public paused;

    // ─── Game Modes ───────────────────────────────────────────────────────────
    enum GameMode {
        CLASSIC,   // Any line — row, column, or diagonal
        BLACKOUT,  // Full card — all 25 numbers
        CORNERS,   // Four corners only
        X_FACTOR   // Both diagonals (X shape)
        // More modes can be added here in future upgrades
    }

    // ─── Round States ─────────────────────────────────────────────────────────
    enum RoundState {
        WAITING,   // Open — accepting players
        LOCKED,    // Drawing in progress
        FINISHED,  // Complete — winners paid
        CANCELLED  // Cancelled — refunds sent
    }

    // ─── Structs ──────────────────────────────────────────────────────────────
    struct Round {
        uint256   entryFee;          // USDC per player (6 decimals)
        uint256   maxPlayers;        // Owner configurable
        uint256   timerDuration;     // Seconds after first join before lock
        uint256   startTime;         // Timestamp of first player joining
        uint256   prizePool;         // Total USDC collected
        GameMode  mode;              // Pattern type
        RoundState state;            // Current state
        bytes32   randomSeed;        // From Pyth Entropy
        uint8[]   drawnNumbers;      // 1–75 drawn numbers
        address[] players;           // Joined player addresses
        address[] winners;           // Winner address(es) for ties
        uint64    entropySeqNum;     // Pyth sequence number
        bool      entropyRequested;  // Whether Pyth has been called
    }

    // ─── State ────────────────────────────────────────────────────────────────
    mapping(uint256 => Round)              public rounds;
    mapping(uint256 => mapping(address => bool)) public hasJoined;
    mapping(uint64  => uint256)            private _seqToRound;

    uint256 public roundCount;
    uint256 public houseFunds;     // Accumulated 10% house cuts
    uint256 public constant HOUSE_CUT_BPS = 1000; // 10%
    uint256 public constant WINNER_BPS    = 9000; // 90%

    // ─── Events ───────────────────────────────────────────────────────────────
    event RoundCreated(
        uint256 indexed roundId,
        uint256 entryFee,
        uint256 maxPlayers,
        uint256 timerDuration,
        GameMode mode
    );
    event PlayerJoined(uint256 indexed roundId, address indexed player, uint256 playerCount);
    event RoundLocked(uint256 indexed roundId, uint256 prizePool, uint256 playerCount);
    event NumbersDrawn(uint256 indexed roundId, uint8[] drawnNumbers);
    event RoundFinished(uint256 indexed roundId, address[] winners, uint256 payoutEach, uint256 houseCut);
    event RoundCancelled(uint256 indexed roundId, uint256 refundAmount);
    event HouseWithdrawn(uint256 amount);

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyOwner()     { require(msg.sender == owner, "Not owner"); _; }
    modifier whenNotPaused() { require(!paused, "Paused"); _; }
    modifier roundExists(uint256 id) { require(id < roundCount, "Round not found"); _; }

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

    // ─── Required by IEntropyConsumer ─────────────────────────────────────────
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    // ─── Owner: Create Round ──────────────────────────────────────────────────

    /// @notice Owner creates a new round with full configuration
    /// @param entryFee     USDC entry fee in 6 decimals (e.g. 5000000 = $5)
    /// @param maxPlayers   Maximum players allowed (min 2)
    /// @param timerSeconds Seconds after first join before round locks
    /// @param mode         Game mode (0=CLASSIC 1=BLACKOUT 2=CORNERS 3=X_FACTOR)
    function createRound(
        uint256  entryFee,
        uint256  maxPlayers,
        uint256  timerSeconds,
        GameMode mode
    ) external onlyOwner whenNotPaused {
        require(entryFee   >= 100_000,  "Min entry $0.10");
        require(maxPlayers >= 2,         "Min 2 players");
        require(maxPlayers <= 100,       "Max 100 players");
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

    /// @notice Join an open round by paying the entry fee
    /// @param roundId The round to join
    function joinRound(uint256 roundId)
        external nonReentrant whenNotPaused roundExists(roundId)
    {
        Round storage r = rounds[roundId];

        require(r.state == RoundState.WAITING,  "Round not open");
        require(!hasJoined[roundId][msg.sender], "Already joined");
        require(r.players.length < r.maxPlayers, "Round full");

        // Check timer hasn't expired (if at least 1 player already in)
        if (r.players.length > 0) {
            require(
                block.timestamp < r.startTime + r.timerDuration,
                "Round timer expired"
            );
        }

        // Collect USDC directly into this contract
        usdc.safeTransferFrom(msg.sender, address(this), r.entryFee);

        // Record first join time for timer
        if (r.players.length == 0) {
            r.startTime = block.timestamp;
        }

        hasJoined[roundId][msg.sender] = true;
        r.players.push(msg.sender);
        r.prizePool += r.entryFee;

        emit PlayerJoined(roundId, msg.sender, r.players.length);

        // Auto-lock if max players reached
        if (r.players.length == r.maxPlayers) {
            _lockAndDraw(roundId);
        }
    }

    // ─── Lock Round (anyone can trigger after timer expires) ──────────────────

    /// @notice Lock the round and request randomness. Callable by anyone
    ///         after the timer expires. Owner can call anytime.
    function lockRound(uint256 roundId)
        external nonReentrant roundExists(roundId)
    {
        Round storage r = rounds[roundId];
        require(r.state == RoundState.WAITING, "Not waiting");
        require(r.players.length > 0,          "No players");

        bool timerExpired = block.timestamp >= r.startTime + r.timerDuration;
        bool isOwner      = msg.sender == owner;

        require(timerExpired || isOwner, "Timer not expired yet");

        // Cancel if less than 2 players
        if (r.players.length < 2) {
            _cancelRound(roundId);
            return;
        }

        _lockAndDraw(roundId);
    }

    // ─── Internal: Lock + Request Entropy ─────────────────────────────────────
    function _lockAndDraw(uint256 roundId) internal {
        Round storage r = rounds[roundId];
        r.state = RoundState.LOCKED;

        emit RoundLocked(roundId, r.prizePool, r.players.length);

        // Request Pyth Entropy — one call resolves everything
        uint256 fee = entropy.getFeeV2();
        require(address(this).balance >= fee, "Insufficient ETH for Pyth fee");

        uint64 seqNum = entropy.requestV2{value: fee}();
        r.entropySeqNum     = seqNum;
        r.entropyRequested  = true;
        _seqToRound[seqNum] = roundId;
    }

    // ─── Pyth Entropy Callback ────────────────────────────────────────────────
    function entropyCallback(
        uint64  seqNum,
        address,
        bytes32 randomNumber
    ) internal override {
        uint256 roundId = _seqToRound[seqNum];
        Round storage r = rounds[roundId];

        require(r.state == RoundState.LOCKED, "Round not locked");

        r.randomSeed = randomNumber;

        // Generate all drawn numbers from the seed
        r.drawnNumbers = _drawNumbers(randomNumber);

        emit NumbersDrawn(roundId, r.drawnNumbers);

        // Resolve winners
        _resolveRound(roundId);
    }

    // ─── Resolve Winners ──────────────────────────────────────────────────────
    function _resolveRound(uint256 roundId) internal {
        Round storage r = rounds[roundId];

        address[] memory winners = new address[](r.players.length);
        uint256 winnerCount = 0;
        uint256 winningReveal = 75; // The drawn number index at which win detected

        // Check each player's card against drawn numbers progressively
        // Find the earliest number reveal at which any player wins
        for (uint256 reveal = 1; reveal <= r.drawnNumbers.length;) {
            // Build set of drawn numbers up to this reveal
            // Check all players at this reveal count
            for (uint256 p = 0; p < r.players.length;) {
                uint8[25] memory card = _generateCard(r.randomSeed, r.players[p]);
                bool[25]  memory matched = _matchNumbers(card, r.drawnNumbers, reveal);
                if (_checkPattern(matched, r.mode)) {
                    if (reveal < winningReveal) {
                        // New earliest win — reset winners
                        winnerCount  = 0;
                        winningReveal = reveal;
                    }
                    if (reveal == winningReveal) {
                        winners[winnerCount++] = r.players[p];
                    }
                }
                unchecked { p++; }
            }
            if (winnerCount > 0) break;
            unchecked { reveal++; }
        }

        // Pay out
        if (winnerCount > 0) {
            // Store winners
            for (uint256 i; i < winnerCount;) {
                r.winners.push(winners[i]);
                unchecked { i++; }
            }

            uint256 houseCut    = (r.prizePool * HOUSE_CUT_BPS) / 10_000;
            uint256 winnerPool  = r.prizePool - houseCut;
            uint256 payoutEach  = winnerPool / winnerCount;

            // Send winnings to each winner
            for (uint256 i; i < winnerCount;) {
                usdc.safeTransfer(winners[i], payoutEach);
                unchecked { i++; }
            }

            // Accumulate house cut (owner withdraws separately)
            houseFunds += houseCut;

            r.state = RoundState.FINISHED;
            emit RoundFinished(roundId, r.winners, payoutEach, houseCut);

        } else {
            // Nobody won after all 75 numbers — extremely rare
            // Split prize pool equally as refund
            _cancelRound(roundId);
        }
    }

    // ─── Internal: Cancel Round ───────────────────────────────────────────────
    function _cancelRound(uint256 roundId) internal {
        Round storage r = rounds[roundId];
        r.state = RoundState.CANCELLED;

        // Refund all players directly from this contract
        uint256 refundAmount = r.entryFee;
        for (uint256 i; i < r.players.length;) {
            usdc.safeTransfer(r.players[i], refundAmount);
            unchecked { i++; }
        }

        emit RoundCancelled(roundId, refundAmount);
    }

    // ─── Card Generation ──────────────────────────────────────────────────────

    /// @dev Each player gets a unique 5x5 card from roundSeed + their address
    function _generateCard(bytes32 seed, address player)
        internal pure returns (uint8[25] memory card)
    {
        bytes32 playerSeed = keccak256(abi.encode(seed, player, "card"));
        uint8[75] memory pool;
        for (uint8 i; i < 75;) { pool[i] = i + 1; unchecked { i++; } }

        // Fisher-Yates shuffle using player-specific seed
        for (uint8 i = 74; i > 0;) {
            uint8 j = uint8(
                uint256(keccak256(abi.encode(playerSeed, i))) % (i + 1)
            );
            (pool[i], pool[j]) = (pool[j], pool[i]);
            unchecked { i--; }
        }
        for (uint8 i; i < 25;) { card[i] = pool[i]; unchecked { i++; } }
    }

    /// @dev Draw 75 numbers in shuffled order from round seed
    function _drawNumbers(bytes32 seed)
        internal pure returns (uint8[] memory drawn)
    {
        bytes32 drawSeed = keccak256(abi.encode(seed, "draw"));
        uint8[75] memory pool;
        for (uint8 i; i < 75;) { pool[i] = i + 1; unchecked { i++; } }

        for (uint8 i = 74; i > 0;) {
            uint8 j = uint8(
                uint256(keccak256(abi.encode(drawSeed, i))) % (i + 1)
            );
            (pool[i], pool[j]) = (pool[j], pool[i]);
            unchecked { i--; }
        }

        drawn = new uint8[](75);
        for (uint8 i; i < 75;) { drawn[i] = pool[i]; unchecked { i++; } }
    }

    // ─── Number Matching ──────────────────────────────────────────────────────
    function _matchNumbers(
        uint8[25] memory card,
        uint8[]   memory drawn,
        uint256   revealCount
    ) internal pure returns (bool[25] memory matched) {
        for (uint8 i; i < 25;) {
            for (uint256 j; j < revealCount;) {
                if (card[i] == drawn[j]) { matched[i] = true; break; }
                unchecked { j++; }
            }
            unchecked { i++; }
        }
    }

    // ─── Pattern Checkers ─────────────────────────────────────────────────────
    function _checkPattern(bool[25] memory m, GameMode mode)
        internal pure returns (bool)
    {
        if (mode == GameMode.CLASSIC)  return _checkAnyLine(m);
        if (mode == GameMode.BLACKOUT) return _checkFull(m);
        if (mode == GameMode.CORNERS)  return m[0] && m[4] && m[20] && m[24];
        if (mode == GameMode.X_FACTOR) {
            return m[0]&&m[6]&&m[12]&&m[18]&&m[24]   // diagonal 1
                && m[4]&&m[8]&&m[12]&&m[16]&&m[20];   // diagonal 2
        }
        return false;
    }

    function _checkAnyLine(bool[25] memory m) internal pure returns (bool) {
        // Rows
        for (uint8 r; r < 5;) {
            uint8 b = r * 5;
            if (m[b]&&m[b+1]&&m[b+2]&&m[b+3]&&m[b+4]) return true;
            unchecked { r++; }
        }
        // Cols
        for (uint8 c; c < 5;) {
            if (m[c]&&m[c+5]&&m[c+10]&&m[c+15]&&m[c+20]) return true;
            unchecked { c++; }
        }
        // Diagonals
        if (m[0]&&m[6]&&m[12]&&m[18]&&m[24]) return true;
        if (m[4]&&m[8]&&m[12]&&m[16]&&m[20]) return true;
        return false;
    }

    function _checkFull(bool[25] memory m) internal pure returns (bool) {
        for (uint8 i; i < 25;) { if (!m[i]) return false; unchecked { i++; } }
        return true;
    }

    // ─── Owner: Withdraw House Funds ──────────────────────────────────────────

    /// @notice Owner withdraws accumulated house cut at any time
    function withdrawHouseFunds() external onlyOwner nonReentrant {
        uint256 amount = houseFunds;
        require(amount > 0, "Nothing to withdraw");
        houseFunds = 0;
        usdc.safeTransfer(owner, amount);
        emit HouseWithdrawn(amount);
    }

    /// @notice Owner withdraws specific amount of house funds
    function withdrawHouseFunds(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= houseFunds, "Exceeds house funds");
        houseFunds -= amount;
        usdc.safeTransfer(owner, amount);
        emit HouseWithdrawn(amount);
    }

    // ─── Owner: Emergency Cancel ──────────────────────────────────────────────

    /// @notice Emergency cancel — refunds all players, cannot steal funds
    function emergencyCancel(uint256 roundId)
        external onlyOwner roundExists(roundId)
    {
        Round storage r = rounds[roundId];
        require(
            r.state == RoundState.WAITING || r.state == RoundState.LOCKED,
            "Cannot cancel"
        );
        _cancelRound(roundId);
    }

    // ─── Owner: Config ────────────────────────────────────────────────────────
    function setPaused(bool _p) external onlyOwner { paused = _p; }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero");
        owner = newOwner;
    }

    // ─── ETH receive (for Pyth fee funding) ──────────────────────────────────
    receive() external payable {}

    function withdrawEth(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient ETH");
        (bool ok,) = owner.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    function getRound(uint256 roundId) external view returns (
        uint256   entryFee,
        uint256   maxPlayers,
        uint256   timerDuration,
        uint256   startTime,
        uint256   prizePool,
        GameMode  mode,
        RoundState state,
        uint256   playerCount,
        address[] memory winners
    ) {
        Round storage r = rounds[roundId];
        return (
            r.entryFee, r.maxPlayers, r.timerDuration,
            r.startTime, r.prizePool, r.mode, r.state,
            r.players.length, r.winners
        );
    }

    function getPlayers(uint256 roundId)
        external view returns (address[] memory)
    {
        return rounds[roundId].players;
    }

    function getDrawnNumbers(uint256 roundId)
        external view returns (uint8[] memory)
    {
        return rounds[roundId].drawnNumbers;
    }

    /// @notice Get a player's card for a specific round (after round is locked)
    function getPlayerCard(uint256 roundId, address player)
        external view returns (uint8[25] memory)
    {
        Round storage r = rounds[roundId];
        require(
            r.state == RoundState.LOCKED   ||
            r.state == RoundState.FINISHED ||
            r.state == RoundState.CANCELLED,
            "Round not started yet"
        );
        return _generateCard(r.randomSeed, player);
    }

    function getEntropyFee() external view returns (uint256) {
        return entropy.getFeeV2();
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
}
