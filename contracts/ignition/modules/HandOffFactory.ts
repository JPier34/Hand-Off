import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import HandOffReputationModule from "./HandOffReputation";
import HandOffSubnameRegistrarModule from "./HandOffSubnameRegistrar";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

// Uniswap Universal Router 2.0 on Eth Sepolia + Mainnet (canonical Uniswap address on all EVM chains)
const UNISWAP_ROUTER = "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD";
const FEE_RECIPIENT = process.env.FEE_RECIPIENT ?? "0x0000000000000000000000000000000000000000";
const PROTOCOL_FEE_BPS = Number(process.env.PROTOCOL_FEE_BPS ?? "1");

const HandOffFactoryModule = buildModule("HandOffFactory", (m) => {
  // Deploy (or reuse) Reputation and SubnameRegistrar as explicit dependencies.
  // This ensures the Factory always receives the correct, freshly-deployed addresses
  // instead of a hardcoded constant that can become stale across redeployments.
  const { reputation } = m.useModule(HandOffReputationModule);
  const { registrar } = m.useModule(HandOffSubnameRegistrarModule);

  const factory = m.contract("HandOffFactory", [
    reputation,
    registrar,       // SubnameRegistrar address — wired at deploy time, not hardcoded
    UNISWAP_ROUTER,
    FEE_RECIPIENT,
    PROTOCOL_FEE_BPS,
  ]);

  // Transfer AUTHORIZED_DEPLOYER role from the EOA to the factory.
  // After this call the system is fully autonomous — no human needed per deal.
  m.call(reputation, "transferDeployer", [factory], {
    id: "transferDeployerToFactory",
  });

  // ── Post-deploy manual step (cannot be scripted — requires ENS owner's signature) ──
  // The deployer wallet (account 0) must also own "hand-off.eth" in the ENS Registry,
  // OR approve the SubnameRegistrar as an operator. Call ONE of the following from the
  // wallet that owns "hand-off.eth" on the target network:
  //
  //   Option A (transfer ownership — recommended):
  //     ENS_Registry.setOwner(namehash("hand-off.eth"), registrar.address)
  //
  //   Option B (keep ownership, grant operator rights):
  //     ENS_Registry.setApprovalForAll(registrar.address, true)
  //
  // Without this step, _mintReceipt() in SubnameRegistrar will revert at setSubnodeRecord
  // even though escrow registration and the onlyRegisteredEscrow check both pass.

  return { factory, reputation, registrar };
});

export default HandOffFactoryModule;
