# UOMI Staking Contract

A comprehensive Solidity smart contract for token staking with fixed-duration periods, reward distribution, and administrative controls. Built with Hardhat and featuring extensive test coverage.

## 🚀 Features

- **24-Hour Deposit Window**: Users can only stake during a 24-hour window after staking is started
- **14-Day Staking Duration**: Fixed staking period of 14 days
- **15% Rewards**: Guaranteed 15% reward on staked tokens
- **260M Token Cap**: Maximum total stake limit across all users
- **Incremental Staking**: Users can increase their stake multiple times during the deposit window
- **Owner Controls**: Administrative functions for reward management and token recovery
- **Reentrancy Protection**: Built-in security against reentrancy attacks
- **Comprehensive Testing**: 78 test cases covering all scenarios including incremental staking

## 📋 Contract Specifications

| Parameter | Value |
|-----------|-------|
| Deposit Window | 24 hours |
| Staking Duration | 14 days |
| Reward Percentage | 15% |
| Maximum Total Stake | 260,000,000 tokens |
| Stakes Per User | Multiple (during deposit window) |
| Minimum Stake | > 0 tokens |

## 🛠 Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd uomi-staking
```

2. Install dependencies:
```bash
npm install
```

3. Compile contracts:
```bash
npx hardhat compile
```

## 🧪 Testing

Run the complete test suite:

```bash
npx hardhat test
```

### Test Coverage

The project includes 78 comprehensive tests organized in four categories:

- **Main Tests** (`Staking.test.js`): Core functionality testing including incremental staking
- **Incremental Staking Tests** (`Staking.incremental.test.js`): Dedicated tests for multiple stake functionality
- **Integration Tests** (`Staking.integration.test.js`): End-to-end scenarios
- **Error Handling Tests** (`Staking.errors.test.js`): Edge cases and error conditions

All tests pass successfully, ensuring robust contract behavior.

## 📖 Contract API

### Core Functions

#### `startStaking()` (Owner Only)
Initiates the staking period and opens the 24-hour deposit window.

```solidity
function startStaking() external onlyOwner
```

#### `stake(uint256 _amount)`
Allows users to stake tokens during the deposit window. Users can call this function multiple times to increase their stake.

```solidity
function stake(uint256 _amount) external
```

**Requirements:**
- Staking must be active and within deposit window
- Amount must be greater than 0
- Total stake (including previous stakes) must not exceed 260M cap
- User must have sufficient token balance and allowance

**Events:**
- First stake: Emits `Staked(user, amount)`
- Subsequent stakes: Emits `StakeIncreased(user, additionalAmount, totalAmount)`

#### `claim()`
Allows users to withdraw their staked tokens plus rewards after the staking period ends.

```solidity
function claim() external
```

**Requirements:**
- Staking period must have ended
- User must have tokens staked
- Rewards must not have been claimed already

### Administrative Functions

#### `depositRewards(uint256 _amount)` (Owner Only)
Deposits tokens to the contract for reward distribution.

```solidity
function depositRewards(uint256 _amount) external onlyOwner
```

#### `withdrawUnusedTokens(uint256 _amount)` (Owner Only)
Withdraws unused tokens from the contract after staking ends.

```solidity
function withdrawUnusedTokens(uint256 _amount) external onlyOwner
```

### View Functions

#### `calculateReward(address _user)`
Returns the staked amount and calculated reward for a user.

```solidity
function calculateReward(address _user) external view returns (uint256 stakedAmount, uint256 rewardAmount)
```

#### `isDepositWindowOpen()`
Checks if the deposit window is currently active.

```solidity
function isDepositWindowOpen() external view returns (bool)
```

#### `isStakingEnded()`
Checks if the staking period has ended.

```solidity
function isStakingEnded() external view returns (bool)
```

#### `getRemainingCapacity()`
Returns the remaining staking capacity before hitting the 260M cap.

```solidity
function getRemainingCapacity() external view returns (uint256)
```

#### `getUserStakeInfo(address _user)`
Returns comprehensive staking information for a user.

```solidity
function getUserStakeInfo(address _user) external view returns (uint256 stakedAmount, bool claimed, uint256 potentialReward)
```

## 🔐 Security Features

- **Reentrancy Guard**: Protects against reentrancy attacks
- **Access Control**: Owner-only functions for administrative tasks
- **Input Validation**: Comprehensive checks on all parameters
- **State Management**: Proper state transitions and validations
- **Safe Math**: Built-in overflow protection (Solidity 0.8.20+)

## 📊 Contract States

### Staking Lifecycle

1. **Pre-Start**: Contract deployed, staking not yet started
2. **Deposit Window**: 24-hour period where users can stake
3. **Staking Period**: 14-day period where tokens are locked
4. **Claim Period**: Users can withdraw staked tokens + rewards

### User States

- **No Stake**: User has not staked any tokens
- **Staked**: User has staked tokens during deposit window (can increase multiple times)
- **Claimed**: User has withdrawn their stake and rewards

## ⚡ Usage Examples

### For Users

```javascript
// Approve tokens for staking
await token.approve(stakingContract.address, amount);

// Initial stake during deposit window
await stakingContract.stake(ethers.parseUnits("1000", 18));

// Increase stake (multiple times allowed during deposit window)
await stakingContract.stake(ethers.parseUnits("500", 18));
await stakingContract.stake(ethers.parseUnits("300", 18));

// Check staking info
const [staked, claimed, reward] = await stakingContract.getUserStakeInfo(userAddress);

// Claim after staking period ends
await stakingContract.claim();
```

### For Contract Owner

```javascript
// Start the staking period
await stakingContract.startStaking();

// Deposit rewards for distribution
await token.approve(stakingContract.address, rewardAmount);
await stakingContract.depositRewards(rewardAmount);

// Withdraw unused tokens after staking ends
await stakingContract.withdrawUnusedTokens(amount);
```

## 📝 Events

The contract emits the following events:

- `StakingStarted(uint256 startTime)`: When staking period begins
- `Staked(address indexed user, uint256 amount)`: When a user stakes tokens for the first time
- `StakeIncreased(address indexed user, uint256 additionalAmount, uint256 totalAmount)`: When a user increases their existing stake
- `Claimed(address indexed user, uint256 stakedAmount, uint256 rewardAmount)`: When a user claims rewards

## 🏗 Architecture

### Dependencies

- **OpenZeppelin Contracts v5.3.0**:
  - `Ownable`: Access control for administrative functions
  - `ReentrancyGuard`: Protection against reentrancy attacks
  - `IERC20`: Interface for token interactions

### File Structure

```
contracts/
├── Staking.sol          # Main staking contract
└── MockERC20.sol        # Test token for testing

test/
├── Staking.test.js                  # Core functionality tests
├── Staking.incremental.test.js      # Incremental staking tests
├── Staking.integration.test.js      # Integration scenarios
├── Staking.errors.test.js           # Error handling tests
└── README.md                        # Test documentation
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🔍 Audit Status

⚠️ **This contract has not been audited**. Please conduct a thorough security audit before deploying to mainnet.

## 📞 Support

For questions, issues, or contributions, please open an issue in the repository.

---

**Built with ❤️ using Hardhat and OpenZeppelin**