# P256 Example WIP

This project demonstrates how to extract the necessary cryptographic components from a WebAuthn public key and its signature as well as construct 
a message hash such that a P256 signature can be verified in Solidity. 

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```

## WebAuthn 

Be sure to read the [W3C](https://www.w3.org/TR/webauthn-2/) specification for the WebAuthN API.

Public keys and signature objects are returned in [DER](https://en.wikipedia.org/wiki/X.690#DER_encoding) [ASN.1](https://en.wikipedia.org/wiki/ASN.1) format 
which is a self-describing data protocol used in many legacy crypto-systems. Using this serialization/deserialization protocol, the relavent components of 
the public key (QX, QY) and [signature](https://bitcoin.stackexchange.com/questions/92680/what-are-the-der-signature-and-sec-format) (r, s) can be extracted and passed to an on-chain smart contract. 

Here's a good web-based [ASN.1](http://ldh.org/asn1.html) autodecoder. 

### Constructing the Message Hash

The construction of the message hashed signed by the user's passkey is described in steps 19 and 20 of the [W3C spec section 7.2](https://www.w3.org/TR/webauthn-2/#sctn-verifying-assertion). 