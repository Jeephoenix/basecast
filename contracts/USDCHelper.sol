// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract USDCHelper {
    address public constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function approve(address spender, uint256 amount) external returns (bool) {
        (bool ok, bytes memory data) = USDC.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, amount)
        );
        require(ok, "Approve failed");
        return abi.decode(data, (bool));
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        (, bytes memory data) = USDC.staticcall(
            abi.encodeWithSignature("allowance(address,address)", owner, spender)
        );
        return abi.decode(data, (uint256));
    }

    function balanceOf(address account) external view returns (uint256) {
        (, bytes memory data) = USDC.staticcall(
            abi.encodeWithSignature("balanceOf(address)", account)
        );
        return abi.decode(data, (uint256));
    }
}
