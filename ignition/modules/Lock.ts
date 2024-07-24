import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

// You can generate new valid P256 parameters at https://toddchapman.io/passkey-demo
const QX = '0xe5cb61eef9d33263374e67681b575fd29c726f4ab58ae91fd82b6a30e0bb8db1';
const QY = '0x3523d67086dd12a11da06fe596d361401f0083742de6b84e6044a480280e9e82';

const JAN_1ST_2030 = 1893456000;
const ONE_GWEI: bigint = parseEther("0.001");

const LockModule = buildModule("LockModule", (m) => {
  const unlockTime = m.getParameter("unlockTime", JAN_1ST_2030);
  const lockedAmount = m.getParameter("lockedAmount", ONE_GWEI);

  const lock = m.contract("Lock", [unlockTime, QX, QY], {
    value: lockedAmount,
  });

  return { lock };
});

export default LockModule;
