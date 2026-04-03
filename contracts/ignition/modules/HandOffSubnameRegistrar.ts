import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { namehash } from "viem/ens";

// ENS addresses — same on Ethereum mainnet and Sepolia
const ENS_REGISTRY  = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
// Public Resolver on Eth Sepolia (verify at https://app.ens.domains)
const ENS_RESOLVER  = "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD";
// namehash("hand-off.eth") — precomputed via viem
const PARENT_NODE   = namehash("hand-off.eth") as `0x${string}`;

const HandOffSubnameRegistrarModule = buildModule("HandOffSubnameRegistrar", (m) => {
  const deployer = m.getAccount(0);

  const registrar = m.contract("HandOffSubnameRegistrar", [
    deployer,
    ENS_REGISTRY,
    ENS_RESOLVER,
    PARENT_NODE,
  ]);

  return { registrar };
});

export default HandOffSubnameRegistrarModule;
