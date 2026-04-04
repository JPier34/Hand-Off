import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import HandOffReputationModule from "./HandOffReputation";

// Uniswap Universal Router 2.0 on Base Sepolia
// The Uniswap Trading API generates calldata targeting this router.
// HandOff.fundWithSwap() enforces _router == ALLOWED_ROUTER on-chain.
// Set to ZeroAddress to disable the swap path on networks without Uniswap.
//
// Previous deployment used SwapRouter02 (0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45)
// which is INCOMPATIBLE with the Trading API calldata format.
const UNISWAP_ROUTER = "0x492e6456d9528771018deb9e87ef7750ef184104";

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
