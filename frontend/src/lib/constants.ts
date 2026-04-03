// TODO at hackathon: replace with deployed manager address from your smart contract teammate
export const ESCROW_MANAGER_ADDRESS = (
  import.meta.env.VITE_MANAGER_ADDRESS ?? '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// TODO at hackathon: replace with ABI export from Hardhat artifacts
export const MANAGER_ABI = [
  {
    name: 'createDeal',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'timeoutSeconds', type: 'uint256' }],
    outputs: [],
    // emits: DealCreated(uint256 dealId)
  },
  {
    name: 'getDeal',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'dealId', type: 'uint256' }],
    outputs: [
      { name: 'seller',      type: 'address' },
      { name: 'buyer',       type: 'address' },
      { name: 'amount',      type: 'uint256' },
      { name: 'status',      type: 'uint8'   },
      { name: 'expiresAt',   type: 'uint256' },
      { name: 'description', type: 'string'  },
    ],
  },
  {
    name: 'depositFunds',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'dealId',   type: 'uint256' },
      { name: 'codeHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'releaseToSeller',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dealId', type: 'uint256' },
      { name: 'code',   type: 'string'  },
    ],
    outputs: [],
  },
  {
    name: 'claimRefund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'dealId', type: 'uint256' }],
    outputs: [],
  },
] as const
