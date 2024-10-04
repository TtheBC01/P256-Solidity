import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseGwei } from "viem";

const QX = '0x91bb3be0106203c6877db6a2c65a87e725e3c741dfb4e16e39500cdeb9aab4bf';
const QY = '0xef8fbbbd1e8ebd360a5f5926087c1c9504c5242ab14a19039d3986049f935bde';

const R_VALUE = '0xed38e18c1f51e89955af377177a7baeab24340c200d3d80d5cc24ef49021c7ea';
const S_VALUE = '0xb7a4b31248b03d497ac394b85d229f6b29d966f0ec31d85c702e94afc6bbdb0f';

const HASH = '0x4d8312397eb36a700156cc29be35c925372532d7bc42fa34b1c9df72c721ebec';

const AUTH_DATA_BYTES = `0x${'d8a0bf4f8294146ab009857f0c54e7b47dd13980a9ce558becd61dbced0bd8411900000000'}`;
const CLIENT_DATA_JSON_LEFT = '{"type":"webauthn.get","challenge":"';
const CHALLENGE = '0x9fEad8B19C044C2f404dac38B925Ea16ADaa2954';

const CHALLENGE_BASE64 = 'n-rYsZwETC9ATaw4uSXqFq2qKVQ';
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
