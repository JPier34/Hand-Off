import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import HandOffReputationModule from "./HandOffReputation";

// Uniswap V3 SwapRouter02 — same address on most EVM chains
// Set to ZeroAddress to disable the swap path on networks without Uniswap
const UNISWAP_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

// HandOffSubnameRegistrar address on Eth Sepolia (deployed separately)
// Set to ZeroAddress if deploying on Base Sepolia (cross-chain subname minting via event)
const SUBNAME_REGISTRAR = "0x0000000000000000000000000000000000000000";

const HandOffFactoryModule = buildModule("HandOffFactory", (m) => {
  // Re-use the already-deployed reputation contract (will not redeploy if already on-chain)
  const { reputation } = m.useModule(HandOffReputationModule);

  const factory = m.contract("HandOffFactory", [
    reputation,
    SUBNAME_REGISTRAR,
    UNISWAP_ROUTER,
  ]);

  // Transfer AUTHORIZED_DEPLOYER role from the EOA to the factory.
  // After this call the system is fully autonomous — no human needed per deal.
  m.call(reputation, "transferDeployer", [factory], {
    id: "transferDeployerToFactory",
  });

  return { factory, reputation };
});

export default HandOffFactoryModule;
