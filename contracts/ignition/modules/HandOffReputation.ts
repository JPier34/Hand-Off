import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const HandOffReputationModule = buildModule("HandOffReputation", (m) => {
  const deployer = m.getAccount(0);
  const reputation = m.contract("HandOffReputation", [deployer]);
  return { reputation };
});

export default HandOffReputationModule;
