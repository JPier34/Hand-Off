import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import HandOffReputationModule from "./HandOffReputation";

// Uniswap Universal Router 2.0 on Eth Sepolia
// Same canonical address as mainnet — deployed by Uniswap at this address on all EVM chains.
const UNISWAP_ROUTER = "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD";

// HandOffSubnameRegistrar already deployed on Eth Sepolia — same chain as Factory.
// Passing the real address enables same-chain ENS minting directly from unlock().
const SUBNAME_REGISTRAR = "0x8e9568CF2F4Aa172DCDc91d320d96B964255226B";

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
