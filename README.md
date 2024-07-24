# P256 Example in Solidity

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

> [!NOTE]
> The `P256.sol` library has not yet made it to the OpenZeppelin NPMJS package. The `/contracts` folder currently includes the requisite contracts
> pulled from the OZ github master branch. 

## The WebAuthn API

The Web Authentication API has been implemented by all major browsers and provides a seamless and secure authentication experience for end users based on public key cryptography. 
Be sure to read the [W3C](https://www.w3.org/TR/webauthn-2/) specification for the WebAuthN API.

Public keys and signature objects are returned in [DER](https://en.wikipedia.org/wiki/X.690#DER_encoding) [ASN.1](https://en.wikipedia.org/wiki/ASN.1) format 
(here's a good web-based [ASN.1](http://ldh.org/asn1.html) autodecoder) which is a self-describing data protocol used in many legacy crypto-systems. Using this serialization/deserialization protocol, the relavent components of 
the public key (QX, QY) and [signature](https://bitcoin.stackexchange.com/questions/92680/what-are-the-der-signature-and-sec-format) (r, s) can be extracted and passed to an on-chain smart contract. 

### Constructing the Message Hash

The construction of the message hashed signed by the user's passkey is described in steps 19 and 20 of the [W3C spec section 7.2](https://www.w3.org/TR/webauthn-2/#sctn-verifying-assertion).

When a user signature is prompted via `navigator.credentials.get`, the response has four components:

```javascript
const { authenticatorData, clientDataJSON, signature, userHandle } = pubKeyCredential.response;
```

The message hash is the binary concatenation of `authenticatorData` (which is a `BufferArray`) and the `sha256` hash of `clientDataJSON` (which is a simple JSON object). 

```javascript
// hash clientDataJSON
const clientDataUint8Array = new Uint8Array(clientDataJSON);
const clientDataHash = await crypto.subtle.digest("SHA-256", clientDataUint8Array);

// concatenate authenticatorData and clientDataHash
const combinedLength = authenticatorData.byteLength + clientDataHash.byteLength;
const authMessageBuffer = new ArrayBuffer(combinedLength);

// We'll store all the bytes in a combined view
const combinedView = new Uint8Array(authMessageBuffer);

// cast the buffers as Uint8Arrays
const authDataView = new Uint8Array(authenticatorData);
const cDataHashView = new Uint8Array(clientDataHash);

// Set the appropriate components of the combinedView container
combinedView.set(authDataView, 0);
combinedView.set(cDataHashView, authenticatorData.byteLength);

// Finally, you can user crypto.subtle.digest to hash authMessageBuffer and send the result to Solidity
const authMessageHash = await crypto.subtle.digest("SHA-256", new Uint8Array(authMessageBuffer));
const authMessageHashString = authMessageHash.reduce((t, x) => t + x.toString(16).padStart(2, '0'), ''); // prepend w/ `0x` and send to Solidity
```

Now `authMessageBuffer` contains a byte payload than can be used by `crypto.subtle.verify`. The hashing algorithm used for the authentication message
in the WebAuthn spec is `sha256` (not `keccak256`), so you must compute the `sha256` hash of `authMessageBuffer` in order to use the `verify` method
provided by `P256.sol`. 

### Challenge String

When requesting a signature from a user via the WebAuthn api, the client application must pass along *challenge* string as part of the message payload:

```javascript
const publicKey = {
    challenge: new TextEncoder().encode("Arbitrary message text goes here"), // this is your challenge string
    rpId: window.location.host,
    timeout: 60_000,
};
navigator.credentials.get({
    publicKey,
    mediation: 'optional',
})
```

According to the [W3C spec section 7.2](https://www.w3.org/TR/webauthn-2/#sctn-verifying-assertion) step 12, internally the challenge string is *base64url* 
encoded before signing. 

After retrieving the result of `navigator.credential.get`, the contents of `clientDataJSON` will look something like this:

```javascript
{"type":"webauthn.create","challenge":"QXJiaXRyYXJ5IG1lc3NhZ2UgdGV4dCBnb2VzIGhlcmU=","origin":"https://toddchapman.io","crossOrigin":false,"other_keys_can_be_added_here":"do not compare clientDataJSON against a template. See https://goo.gl/yabPex"}
```

> [!NOTE]
> The keys included in `clientDataJSON` can change from one invocation to the next (as indicated in the above example), don't rely on a specific content layout.

## Parsing the Signature

The signature is returned as part of the `navigator.credentials.get` payload:

```javascript
const { authenticatorData, clientDataJSON, signature, userHandle } = pubKeyCredential.response;
```

It is DER ASN.1 encoded and must be parsed to extract its components (Qx and Qy):

```javascript

// curve elements MUST be 32 bytes for use in secp256r1 implementations
// this function converts variable length ArrayBuffers to 32 byte ArrayBuffers 
// representing integer field elements since P256 signatures are variable length
// https://transactionfee.info/charts/bitcoin-script-ecdsa-length/
function formatInteger(integerBytes) {
  if (integerBytes.byteLength === 32) return integerBytes;
  if (integerBytes.byteLength < 32) {
    return concatenateUint8Array(
        // pad the most significant digits with 0's if too short
        new Uint8Array(32 - integerBytes.byteLength).fill(0),
        integerBytes
    );
  }

  // remove superfluous 0's if too long
  return integerBytes.slice(-32);
}

signatureView = new Uint8Array(signature);

// First value is the header and should be 0x30
const headerByte = signatureView[0];

// Second value tells you the length of the rest of the data array
const signatureLength = signatureView[1];

// Third value tells you the type of the next value which MUST be an integer (0x02) if this is a signature array
// https://en.wikipedia.org/wiki/X.690#identifier_octets
const rTypeIndicatorByte = signatureView[2];
console.assert(rTypeIndicatorByte === 2, "This is not a signature byte array");

// Forth Value is the length of the first coordinate (r) of the signature (r,s)
// r could be less than 32 bytes
const rLength = signatureView[3];

// Slice out the r value and pad it if it is less than 32 bytes
const rValueUint8Array = formatInteger(signatureView.slice(4, 4 + rLength));
const rString = rValueUint8Array.reduce((t, x) => t + x.toString(16).padStart(2, '0'), '');

// Now you will read the s value, you should check that its type is an integer for safety (0x02)
const sTypeIndicatorByte = signatureView[4 + rLength];
console.assert(sTypeIndicatorByte === 2, "This is not a signature byte array");

// Now get the length of the s value of the signature (r,s)
// s could be less than 32 bytes
const sLength = signatureView[4 + rLength + 1];

// Slice out the s value 
const startingByte = 4 + metadataLength + 2;
const endingByte = startingByte + sLength;
const sValueUint8Array = formatInteger(signatureView.slice(startingByte, endingByte));
const sString = sValueUint8Array.reduce((t, x) => t + x.toString(16).padStart(2, '0'), '');
```

> [!IMPORTANT]
> The `P256.sol` implementation disallows signatures where the `s` value is above `N/2` to prevent malleability. To flip the `s` value, compute `s = N - s`.
> For `secp256r1`, the value of `N` is `0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551`.

## Parsing the Public Key

The public key is returned as the output of the call to `navigator.credentials.create`:

```javascript
const publicKey = pubKeyCredential.response.getPublicKey();
```

Like the signature, the public key is also encoded in DER ASN.1 format. You can extract the Qx and Qy components like this:

```javascript
pubKeyView = new Uint8Array(publicKey);

// describes the DER type to follow
const headerByte = pubKeyView[0];

// Second value tells you the length of the rest of the data array
const keyLength = pubKeyView[1];

// Third byte MUST be equal to 48 if this is a legitimate public key array
const metadataIndicatorByte = pubKeyView[2];
console.assert(metadataIndicatorByte === 48, "This is not a public key byte array");

// Forth Value is the length of the public key metadata
const metadataLength = pubKeyView[3];

// this metadata is a SEQUENCE OF containing the description of the key type (i.e. it should describe a ecPublickey for P-256)
// How to encode OID Object Identifiers: https://learn.microsoft.com/en-us/windows/win32/seccertenroll/about-object-identifier?redirectedfrom=MSDN
// ecPublicKey OID: 06072a8648ce3d0201 -> 1.2.840.10045.2.1 https://www.oid-info.com/get/1.2.840.10045.2.1
// P256 OID: 6082a8648ce3d030107 -> 1.2.840.10045.3.1.7 https://oid-rep.orange-labs.fr/get/1.2.840.10045.3.1.7)
const metadataUint8Array = pubKeyView.slice(4, 4 + metadataLength);
const metadataString = metadataUint8Array.reduce((t, x) => t + x.toString(16).padStart(2, '0'), '');
console.assert(metadataString === '06072a8648ce3d020106082a8648ce3d030107', "This is not an ecPublicKey P256 object");

// The public key indicator byte must be a bit string (0x03)
const publicKeyIndicatorByte = pubKeyView[4 + metadataLength];
console.assert(publicKeyIndicatorByte === 3, "This is not a bit string object");

// Get the length of the public key bit string
const pubKeyLength = pubKeyView[4 + metadataLength + 1];

// Slice out the bit string representing the public key and convert it to a hex string
const startingByte = 4 + metadataLength + 2;
const endingByte = startingByte + pubKeyLength;
const publicKeyUint8Array = pubKeyView.slice(startingByte, endingByte);
const publicKeyString = publicKeyUint8Array.reduce((t, x) => t + x.toString(16).padStart(2, '0'), '');

// finally, break the uncrompressed key into its x and y components which are 64 characters long
// These two quantities can be used in Solidity (after prepending `0x` to the front of the string)
qx = publicKeyString.slice(publicKeyString.length - 128, publicKeyString.length - 64);
qy = publicKeyString.slice(-64);
```