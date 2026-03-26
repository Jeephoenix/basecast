// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IEntropy {
    function requestWithCallback(address provider, bytes32 userRandomNumber)
        external payable returns (uint64 sequenceNumber);
    function getFeeV2(address provider) external view returns (uint128 feeAmount);
}

interface IEntropyConsumer {
    function entropyCallback(uint64 sequenceNumber, address provider, bytes32 randomNumber) external;
}

interface IGameVault {
    function receiveBet(address player, uint256 wager) external;
    function settleBet(address player, uint256 wager, uint256 payout) external;
    function maxBet() external view returns (uint256);
    function minBet() external view returns (uint256);
}

/// @title BaseGame — Abstract Pyth Entropy v2 game
abstract contract BaseGame is ReentrancyGuard, IEntropyConsumer {

    // Pyth Entropy — Base Sepolia:  0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4C
    // Pyth Entropy — Base Mainnet:  0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DA
    IEntropy   public immutable entropy;
    address    public immutable entropyProvider;
    IGameVault public immutable vault;

    address public owner;
    bool    public paused;

    mapping(uint64 => address) internal _pendingPlayer;

    event BetRequested(uint64 indexed seqNum, address indexed player, uint256 wager);
    event BetResolved (uint64 indexed seqNum, address indexed player, uint256 wager, uint256 payout, bool won);

    modifier onlyOwner()    { require(msg.sender == owner,            "Not owner");    _; }
    modifier onlyEntropy()  { require(msg.sender == address(entropy), "Not entropy");  _; }
    modifier whenNotPaused(){ require(!paused,                         "Paused");       _; }

    constructor(address _vault, address _entropy, address _provider) {
        require(_vault != address(0) && _entropy != address(0) && _provider != address(0), "Zero addr");
        vault           = IGameVault(_vault);
        entropy         = IEntropy(_entropy);
        entropyProvider = _provider;
        owner           = msg.sender;
    }

    /// @dev Request randomness from Pyth. msg.value must cover getFeeV2().
    function _requestEntropy(bytes32 userRandom) internal returns (uint64 seqNum) {
        uint128 fee = entropy.getFeeV2(entropyProvider);
        require(address(this).balance >= fee, "Insufficient ETH for fee");
        seqNum = entropy.requestWithCallback{value: fee}(entropyProvider, userRandom);
    }

    /// @dev Implement game resolution logic using the random number.
    function _resolveGame(uint64 seqNum, bytes32 randomNumber) internal virtual;

    /// @notice Called by Pyth after randomness is fulfilled.
    function entropyCallback(uint64 seqNum, address provider, bytes32 randomNumber)
        external override onlyEntropy
    {
        require(provider == entropyProvider, "Wrong provider");
        require(_pendingPlayer[seqNum] != address(0), "Unknown seq");
        _resolveGame(seqNum, randomNumber);
        delete _pendingPlayer[seqNum];
    }

    function getEntropyFee() external view returns (uint128) {
        return entropy.getFeeV2(entropyProvider);
    }

    function setPaused(bool _p) external onlyOwner { paused = _p; }

    function withdrawEth(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient ETH");
        (bool ok,) = owner.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero");
        owner = newOwner;
    }

    receive() external payable {}
}
