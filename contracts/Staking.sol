// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract StakingContract is Ownable, ReentrancyGuard {
    IERC20 public stakingToken;
    
    uint256 public constant DEPOSIT_WINDOW = 24 hours; // Deposit window: 24 hours
    uint256 public constant STAKING_DURATION = 14 days; // Staking duration: 14 days
    uint256 public constant REWARD_PERCENTAGE = 10; // Reward percentage: 10%
    uint256 public constant MAX_TOTAL_STAKE = 150_000_000 * 10**18; // Maximum cap: 150M tokens
    
    uint256 public startTime;
    uint256 public endTime;
    uint256 public totalStaked;
    
    struct StakeInfo {
        uint256 amount;
        bool claimed;
    }
    
    mapping(address => StakeInfo) public stakes;
    address[] public stakers;
    
    event Staked(address indexed user, uint256 amount);
    event StakeIncreased(address indexed user, uint256 additionalAmount, uint256 totalAmount);
    event Claimed(address indexed user, uint256 stakedAmount, uint256 rewardAmount);
    event StakingStarted(uint256 startTime);
    
    constructor(address _stakingToken) Ownable(msg.sender) {
        stakingToken = IERC20(_stakingToken);
    }
    
    modifier onlyDuringDepositWindow() {
        require(startTime > 0, "Staking not started yet");
        require(block.timestamp >= startTime, "Staking not started yet");
        require(block.timestamp <= startTime + DEPOSIT_WINDOW, "Deposit window closed");
        _;
    }
    
    modifier onlyAfterStakingEnd() {
        require(block.timestamp >= endTime, "Staking period not ended yet");
        _;
    }
    
    /**
     * @dev Start the staking period (owner only)
     */
    function startStaking() external onlyOwner {
        require(startTime == 0, "Staking already started");
        
        startTime = block.timestamp;
        endTime = startTime + STAKING_DURATION;
        
        emit StakingStarted(startTime);
    }
    
    /**
     * @dev Stake tokens or increase existing stake
     * @param _amount Amount of tokens to stake
     */
    function stake(uint256 _amount) external onlyDuringDepositWindow nonReentrant {
        require(_amount > 0, "Amount must be greater than 0");
        require(totalStaked + _amount <= MAX_TOTAL_STAKE, "Exceeds maximum cap of 150M tokens");
        
        // Transfer tokens from user to contract
        require(
            stakingToken.transferFrom(msg.sender, address(this), _amount),
            "Transfer failed"
        );
        
        // Check if user is staking for the first time
        bool isFirstStake = stakes[msg.sender].amount == 0;
        
        // Update the stake
        stakes[msg.sender].amount += _amount;
        totalStaked += _amount;
        
        if (isFirstStake) {
            // First stake - add to stakers array and emit Staked event
            stakers.push(msg.sender);
            emit Staked(msg.sender, _amount);
        } else {
            // Increase existing stake - emit StakeIncreased event
            emit StakeIncreased(msg.sender, _amount, stakes[msg.sender].amount);
        }
    }
    
    /**
     * @dev Withdraw staked tokens + rewards after the staking period ends
     */
    function claim() external onlyAfterStakingEnd nonReentrant {
        StakeInfo storage userStake = stakes[msg.sender];
        
        require(userStake.amount > 0, "No tokens staked");
        require(!userStake.claimed, "Rewards already claimed");
        
        uint256 stakedAmount = userStake.amount;
        uint256 rewardAmount = (stakedAmount * REWARD_PERCENTAGE) / 100;
        uint256 totalAmount = stakedAmount + rewardAmount;
        
        // Mark as claimed
        userStake.claimed = true;
        
        // Transfer tokens + rewards
        require(
            stakingToken.transfer(msg.sender, totalAmount),
            "Transfer failed"
        );

        
        emit Claimed(msg.sender, stakedAmount, rewardAmount);
    }
    
    /**
     * @dev Deposit tokens for rewards (owner only)
     * @param _amount Amount of tokens to deposit for rewards
     */
    function depositRewards(uint256 _amount) external onlyOwner {
        require(
            stakingToken.transferFrom(msg.sender, address(this), _amount),
            "Transfer failed"
        );
    }
    
    /**
     * @dev Withdraw unused tokens from contract (owner only, after staking ends)
     * @param _amount Amount to withdraw
     */
    function withdrawUnusedTokens(uint256 _amount) external onlyOwner onlyAfterStakingEnd {
        require(
            stakingToken.transfer(owner(), _amount),
            "Transfer failed"
        );
    }
    
    /**
     * @dev Calculate rewards for a user
     * @param _user User address
     * @return stakedAmount Amount staked
     * @return rewardAmount Calculated reward
     */
    function calculateReward(address _user) external view returns (uint256 stakedAmount, uint256 rewardAmount) {
        stakedAmount = stakes[_user].amount;
        rewardAmount = (stakedAmount * REWARD_PERCENTAGE) / 100;
    }
    
    /**
     * @dev Check if deposit window is active
     */
    function isDepositWindowOpen() external view returns (bool) {
        return (startTime > 0 && 
                block.timestamp >= startTime && 
                block.timestamp <= startTime + DEPOSIT_WINDOW);
    }
    
    /**
     * @dev Check if staking period has ended
     */
    function isStakingEnded() external view returns (bool) {
        return (endTime > 0 && block.timestamp >= endTime);
    }
    
    /**
     * @dev Get time information
     */
    function getTimeInfo() external view returns (
        uint256 _startTime,
        uint256 _endTime,
        uint256 _depositWindowEnd,
        uint256 _currentTime
    ) {
        _startTime = startTime;
        _endTime = endTime;
        _depositWindowEnd = startTime + DEPOSIT_WINDOW;
        _currentTime = block.timestamp;
    }
    
    /**
     * @dev Get total number of stakers
     */
    function getTotalStakers() external view returns (uint256) {
        return stakers.length;
    }
    
    /**
     * @dev Get user staking information
     */
    function getUserStakeInfo(address _user) external view returns (
        uint256 stakedAmount,
        bool claimed,
        uint256 potentialReward
    ) {
        StakeInfo memory userStake = stakes[_user];
        stakedAmount = userStake.amount;
        claimed = userStake.claimed;
        potentialReward = (stakedAmount * REWARD_PERCENTAGE) / 100;
    }

    /**
     * @dev Get the total amount of rewards required for the maximum cap
     */
    function requiredRewards() external pure returns (uint256) {
    return (MAX_TOTAL_STAKE * REWARD_PERCENTAGE) / 100;
    }
    
    /**
     * @dev Get remaining capacity in the cap
     */
    function getRemainingCapacity() external view returns (uint256) {
        return MAX_TOTAL_STAKE - totalStaked;
    }
    
    /**
     * @dev Check if maximum cap has been reached
     */
    function isCapReached() external view returns (bool) {
        return totalStaked >= MAX_TOTAL_STAKE;
    }
}