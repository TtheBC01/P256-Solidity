// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

//import "@openzeppelin/contracts/utils/Base64.sol";
import "./Base64.sol";
import "./P256.sol";

// Uncomment this line to use console.log
import "hardhat/console.sol";

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

    // @notice Verifies a P256 signature against a supplied message hash
    // @param h pre-computed sha256 hash of the conncatenation of authenticatorData and sha256(clienDataJSON)
    // @param r The r component of the P256 signature
    // @param s The s component of the P256 signature (must be < N/2)
    function withdraw(bytes32 h, bytes32 r, bytes32 s) external {
        // this should be done client-side to save gas, but is shown here in this example to
        // explicity demonstrate this requirement of the P256 library
        if(uint256(s) > N/2) {
            uint256 us = N - uint256(s);
            s = bytes32(us);
        }

        require(block.timestamp >= unlockTime, "You can't withdraw yet");
        require(msg.sender == owner, "You aren't the owner");
        require(P256.verify(h, r, s, qx, qy), "Invalid P256 Signature"); // this costs about 235,000 gas units

        emit Withdrawal(address(this).balance, block.timestamp);

        owner.transfer(address(this).balance);
    }

    // @notice Verifies a P256 signature against supplied authenticatorData bytes and clientDataJSON strings
    // @param authenticatorData bytes returned by navigator.credentials.get response
    // @param clientDataJSONLeft JSON string of all keys/values to the left of the challenge string (inluding opening ")
    // @param challengeBase64 the base64url encoded challenge string
    // @param clientDataJSONRight JSON string of all keys/vaules to the right of the challenge string (including closing ")
    // @param r The r component of the P256 signature
    // @param s The s component of the P256 signature (must be < N/2)
    function withdrawWithClientDataJSON(
        bytes memory authenticatorData, 
        string memory clientDataJSONLeft, 
        string memory challengeBase64, 
        string memory clientDataJSONRight, 
        bytes32 r, 
        bytes32 s
        ) external {
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

    // @notice Verifies a P256 signature against supplied authenticatorData bytes and clientDataJSON strings
    // @param authenticatorData bytes returned by navigator.credentials.get response
    // @param clientDataJSONLeft JSON string of all keys/values to the left of the challenge string (inluding opening ")
    // @param challenge and address that was signed by the user passkey
    // @param clientDataJSONRight JSON string of all keys/vaules to the right of the challenge string (including closing ")
    // @param r The r component of the P256 signature
    // @param s The s component of the P256 signature (must be < N/2)
    function withdrawWithClientDataJSONComputeBase64(
        bytes memory authenticatorData, 
        string memory clientDataJSONLeft, 
        address challenge, 
        string memory clientDataJSONRight, 
        bytes32 r, 
        bytes32 s
        ) external {
        // this should be done client-side to save gas, but is shown here in this example to
        // explicity demonstrate this requirement of the P256 library
        if(uint256(s) > N/2) {
            uint256 us = N - uint256(s);
            s = bytes32(us);
        }
        
        // NOTE: Do something with the challenge, like verify that it matches something, before sig verification
        string memory clientDataJSON = string.concat(clientDataJSONLeft, Base64.encodeURL(bytes.concat(bytes20(uint160(challenge)))), clientDataJSONRight);
        bytes32 cDataHash = sha256(bytes(clientDataJSON));
        bytes32 h = sha256(bytes.concat(authenticatorData,cDataHash));

        require(block.timestamp >= unlockTime, "You can't withdraw yet");
        require(msg.sender == owner, "You aren't the owner");
        require(P256.verify(h, r, s, qx, qy), "Invalid P256 Signature");

        emit Withdrawal(address(this).balance, block.timestamp);

        owner.transfer(address(this).balance);
    }

    function stringToAddress(string memory str) public pure returns (address) {
        bytes memory strBytes = bytes(str);
        require(strBytes.length == 42, "Invalid address length");
        bytes memory addrBytes = new bytes(20);

        for (uint i = 0; i < 20; i++) {
            addrBytes[i] = bytes1(hexCharToByte(strBytes[2 + i * 2]) * 16 + hexCharToByte(strBytes[3 + i * 2]));
        }

        return address(uint160(bytes20(addrBytes)));
    }

    function hexCharToByte(bytes1 char) internal pure returns (uint8) {
        uint8 byteValue = uint8(char);
        if (byteValue >= uint8(bytes1('0')) && byteValue <= uint8(bytes1('9'))) {
            return byteValue - uint8(bytes1('0'));
        } else if (byteValue >= uint8(bytes1('a')) && byteValue <= uint8(bytes1('f'))) {
            return 10 + byteValue - uint8(bytes1('a'));
        } else if (byteValue >= uint8(bytes1('A')) && byteValue <= uint8(bytes1('F'))) {
            return 10 + byteValue - uint8(bytes1('A'));
        }
        revert("Invalid hex character");
    }
}
