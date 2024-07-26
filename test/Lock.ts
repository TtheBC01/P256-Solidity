import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseGwei } from "viem";

// You can generate new valid P256 parameters at https://toddchapman.io/passkey-demo
// The values are avaible in the console
const QX = '0x46b816eb4bafcdd992c8f367f14c49324a900322de56917ab269cc41a12adfc3';
const QY = '0x5c38792a526eb57d2795c2a029708394bd61273c785c9a6a35fb93b54f07be5c';

const R_VALUE = '0x678dc2d69bad88a5cc50c3269bce4aba402161274f7daa0595190eb4adddb1f4';
const S_VALUE = '0xb67e2b7d08ddd672b3c899d1b26328d74c776a261f33bc2328c414ee50c08ae6';

const HASH = '0x9fb01c132978415b8294215f17ce29e6297b28efd19209ebbdb50bccc6cb888b';

const AUTH_DATA_BYTES = `0x${'d8a0bf4f8294146ab009857f0c54e7b47dd13980a9ce558becd61dbced0bd8411900000000'}`;
const CLIENT_DATA_JSON_LEFT = '{"type":"webauthn.get","challenge":"';
const CHALLENGE = 'Login to Passkey Demo'; // be careful not to use reserved characters in your challenge string
const CHALLENGE_BASE64 = 'TG9naW4gdG8gUGFzc2tleSBEZW1v';
const CLIENT_DATA_JSON_RIGHT = '","origin":"https://toddchapman.io","crossOrigin":false}';

describe("Lock", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployOneYearLockFixture() {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;

    const lockedAmount = parseGwei("1");
    const unlockTime = BigInt((await time.latest()) + ONE_YEAR_IN_SECS);

    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await hre.viem.getWalletClients();

    const lock = await hre.viem.deployContract("Lock", [unlockTime, QX, QY], {
      value: lockedAmount,
    });

    const publicClient = await hre.viem.getPublicClient();

    return {
      lock,
      unlockTime,
      lockedAmount,
      owner,
      otherAccount,
      publicClient,
      S_VALUE
    };
  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.read.unlockTime()).to.equal(unlockTime);
    });

    it("Should set the right owner", async function () {
      const { lock, owner } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
    });

    it("Should receive and store the funds to lock", async function () {
      const { lock, lockedAmount, publicClient } = await loadFixture(
        deployOneYearLockFixture
      );

      expect(
        await publicClient.getBalance({
          address: lock.address,
        })
      ).to.equal(lockedAmount);
    });

    it("Should fail if the unlockTime is not in the future", async function () {
      // We don't use the fixture here because we want a different deployment
      const latestTime = BigInt(await time.latest());
      await expect(
        hre.viem.deployContract("Lock", [latestTime, QX, QY], {
          value: 1n,
        })
      ).to.be.rejectedWith("Unlock time should be in the future");
    });
  });

  describe("Withdrawals", function () {
    describe("Validations", function () {
      it("Should revert with the right error if called too soon", async function () {
        const { lock } = await loadFixture(deployOneYearLockFixture);

        await expect(lock.write.withdraw([HASH, R_VALUE, S_VALUE])).to.be.rejectedWith(
          "You can't withdraw yet"
        );
      });

      it("Should revert with the right error if called from another account", async function () {
        const { lock, unlockTime, otherAccount } = await loadFixture(
          deployOneYearLockFixture
        );

        // We can increase the time in Hardhat Network
        await time.increaseTo(unlockTime);

        // We retrieve the contract with a different account to send a transaction
        const lockAsOtherAccount = await hre.viem.getContractAt(
          "Lock",
          lock.address,
          { client: { wallet: otherAccount } }
        );
        await expect(lockAsOtherAccount.write.withdraw([HASH, R_VALUE, S_VALUE])).to.be.rejectedWith(
          "You aren't the owner"
        );
      });

      it("Shouldn't fail if the unlockTime has arrived and the owner calls it with hash", async function () {
        const { lock, unlockTime } = await loadFixture(
          deployOneYearLockFixture
        );

        // Transactions are sent using the first signer by default
        await time.increaseTo(unlockTime);

        await expect(lock.write.withdraw([HASH, R_VALUE, S_VALUE])).to.be.fulfilled;
      });

      it("Shouldn't fail if the unlockTime has arrived and the owner calls it with auth and client data", async function () {
        const { lock, unlockTime } = await loadFixture(
          deployOneYearLockFixture
        );

        // Transactions are sent using the first signer by default
        await time.increaseTo(unlockTime);

        await expect(lock.write.withdrawWithClientDataJSON([AUTH_DATA_BYTES, CLIENT_DATA_JSON_LEFT, CHALLENGE_BASE64, CLIENT_DATA_JSON_RIGHT, R_VALUE, S_VALUE])).to.be.fulfilled;
      });

      it("Shouldn't fail if the unlockTime has arrived and the owner calls it with auth and client data and unencoded challenge string", async function () {
        const { lock, unlockTime } = await loadFixture(
          deployOneYearLockFixture
        );

        // Transactions are sent using the first signer by default
        await time.increaseTo(unlockTime);

        await expect(lock.write.withdrawWithClientDataJSONComputeBase64([AUTH_DATA_BYTES, CLIENT_DATA_JSON_LEFT, CHALLENGE, CLIENT_DATA_JSON_RIGHT, R_VALUE, S_VALUE])).to.be.fulfilled;
      });
    });

    describe("Events", function () {
      it("Should emit an event on withdrawals", async function () {
        const { lock, unlockTime, lockedAmount, publicClient } =
          await loadFixture(deployOneYearLockFixture);

        await time.increaseTo(unlockTime);

        const hash = await lock.write.withdraw([HASH, R_VALUE, S_VALUE]);
        await publicClient.waitForTransactionReceipt({ hash });

        // get the withdrawal events in the latest block
        const withdrawalEvents = await lock.getEvents.Withdrawal();
        expect(withdrawalEvents).to.have.lengthOf(1);
        expect(withdrawalEvents[0].args.amount).to.equal(lockedAmount);
      });
    });
  });
});
