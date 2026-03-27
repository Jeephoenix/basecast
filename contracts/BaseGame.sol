// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

interface IGameVault {
    function receiveBet(address player, uint256 wager) external;
    function settleBet(address player, uint256 wager, uint256 payout) external;
    function maxBet() external view returns (uint256);
    function minBet() external view returns (uint256);
}

/// @title BaseGame — Abstract Pyth Entropy v2 base for BaseCast games
abstract contract BaseGame is ReentrancyGuard, IEntropyConsumer {

    // Pyth Entropy contract
    // Base Sepolia:  0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4C
    // Base Mainnet:  0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DA
    IEntropyV2 public immutable entropy;
    IGameVault public immutable vault;

    address public owner;
    bool    public paused;

    mapping(uint64 => address) internal _pendingPlayer;

    event BetRequested(uint64 indexed seqNum, address indexed player, uint256 wager);
    event BetResolved (uint64 indexed seqNum, address indexed player, uint256 wager, uint256 payout, bool won);

    modifier onlyOwner()    { require(msg.sender == owner, "Not owner"); _; }
    modifier whenNotPaused(){ require(!paused, "Paused"); _; }

    constructor(address _vault, address _entropy) {
        require(_vault   != address(0), "Zero vault");
        require(_entropy != address(0), "Zero entropy");
        vault   = IGameVault(_vault);
        entropy = IEntropyV2(_entropy);
        owner   = msg.sender;
    }

    // Required by IEntropyConsumer — returns entropy contract for callback auth
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    // Request randomness — msg.value must cover getFeeV2()
    function _requestEntropy() internal returns (uint64 seqNum) {
        uint256 fee = entropy.getFeeV2();
        require(address(this).balance >= fee, "Insufficient ETH for Pyth fee");
        seqNum = entropy.requestV2{value: fee}();
    }

    // Implement in each game contract
    function _resolveGame(uint64 seqNum, bytes32 randomNumber) internal virtual;

    // Called by Pyth Entropy after randomness fulfilled
    function entropyCallback(
        uint64  seqNum,
        address,        // provider — not needed, using default
        bytes32 randomNumber
    ) internal override {
        require(_pendingPlayer[seqNum] != address(0), "Unknown seq");
        _resolveGame(seqNum, randomNumber);
        delete _pendingPlayer[seqNum];
    }

    // Current Pyth fee — send this as msg.value when placing bet
    function getEntropyFee() external view returns (uint256) {
        return entropy.getFeeV2();
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
