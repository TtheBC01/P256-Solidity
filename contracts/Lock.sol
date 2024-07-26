// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Base64.sol";
import "./P256.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract Lock {
    uint public unlockTime;
    address payable public owner;
    bytes32 qx;
    bytes32 qy;

    uint256 internal constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;

    event Withdrawal(uint amount, uint when);

    constructor(uint _unlockTime, bytes32 _qx, bytes32 _qy) payable {
        require(
            block.timestamp < _unlockTime,
            "Unlock time should be in the future"
        );

        unlockTime = _unlockTime;
        owner = payable(msg.sender);
        qx = _qx;
        qy = _qy;
    }

    function withdraw(bytes32 h, bytes32 r, bytes32 s) public {
        // this should be done client-side to save gas, but is shown here in this example to
        // explicity demonstrate this requirement of the P256 library
        if(uint256(s) > N/2) {
            uint256 us = N - uint256(s);
            s = bytes32(us);
        }
        require(block.timestamp >= unlockTime, "You can't withdraw yet");
        require(msg.sender == owner, "You aren't the owner");
        require(P256.verify(h, r, s, qx, qy), "Invalid P256 Signature");

        emit Withdrawal(address(this).balance, block.timestamp);

        owner.transfer(address(this).balance);
    }

    function withdrawWithClientDataJSON(
        bytes memory authenticatorData, 
        string memory clientDataJSONLeft, 
        string memory challengeBase64, 
        string memory clientDataJSONRight, 
        bytes32 r, 
        bytes32 s
        ) public {
        // this should be done client-side to save gas, but is shown here in this example to
        // explicity demonstrate this requirement of the P256 library
        if(uint256(s) > N/2) {
            uint256 us = N - uint256(s);
            s = bytes32(us);
        }
        
        // NOTE: Do something with the challenge string, like verify that it encodes something, before sig verification
        string memory clientDataJSON = string.concat(clientDataJSONLeft, challengeBase64, clientDataJSONRight);
        bytes32 cDataHash = sha256(bytes(clientDataJSON));
        bytes32 h = sha256(bytes.concat(authenticatorData,cDataHash));

        require(block.timestamp >= unlockTime, "You can't withdraw yet");
        require(msg.sender == owner, "You aren't the owner");
        require(P256.verify(h, r, s, qx, qy), "Invalid P256 Signature");

        emit Withdrawal(address(this).balance, block.timestamp);

        owner.transfer(address(this).balance);
    }

    function withdrawWithClientDataJSONComputeBase64(
        bytes memory authenticatorData, 
        string memory clientDataJSONLeft, 
        string memory challenge, 
        string memory clientDataJSONRight, 
        bytes32 r, 
        bytes32 s
        ) public {
        // this should be done client-side to save gas, but is shown here in this example to
        // explicity demonstrate this requirement of the P256 library
        if(uint256(s) > N/2) {
            uint256 us = N - uint256(s);
            s = bytes32(us);
        }
        
        // NOTE: Do something with the challenge string, like verify that it encodes something, before sig verification
        string memory clientDataJSON = string.concat(clientDataJSONLeft, Base64.encode(bytes(challenge)), clientDataJSONRight);
        bytes32 cDataHash = sha256(bytes(clientDataJSON));
        bytes32 h = sha256(bytes.concat(authenticatorData,cDataHash));

        require(block.timestamp >= unlockTime, "You can't withdraw yet");
        require(msg.sender == owner, "You aren't the owner");
        require(P256.verify(h, r, s, qx, qy), "Invalid P256 Signature");

        emit Withdrawal(address(this).balance, block.timestamp);

        owner.transfer(address(this).balance);
    }
}
