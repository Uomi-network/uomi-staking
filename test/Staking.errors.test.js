const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingContract - Error Handling & Edge Cases", function () {
  const DEPOSIT_WINDOW = 24 * 60 * 60; // 24 hours in seconds
  const STAKING_DURATION = 14 * 24 * 60 * 60; // 14 days in seconds
  const REWARD_PERCENTAGE = 15;
  const MAX_TOTAL_STAKE = ethers.parseUnits("260000000", 18); // 260M tokens
  const INITIAL_SUPPLY = ethers.parseUnits("2000000000", 18); // 2B tokens

  async function deployStakingFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockToken = await ethers.getContractFactory("MockERC20");
    const stakingToken = await MockToken.deploy("UOMI Token", "UOMI", INITIAL_SUPPLY);

    // Deploy staking contract
    const StakingContract = await ethers.getContractFactory("StakingContract");
    const stakingContract = await StakingContract.deploy(stakingToken.target);

    // Transfer tokens to users for testing
    const userAmount = ethers.parseUnits("300000000", 18); // 300M tokens each
    await stakingToken.transfer(user1.address, userAmount);
    await stakingToken.transfer(user2.address, userAmount);
    await stakingToken.transfer(user3.address, userAmount);

    return {
      stakingContract,
      stakingToken,
      owner,
      user1,
      user2,
      user3,
      userAmount
    };
  }

  async function deployAndStartStakingFixture() {
    const fixture = await deployStakingFixture();
    await fixture.stakingContract.startStaking();
    return fixture;
  }

  describe("Constructor Edge Cases", function () {
    it("Should handle zero address token", async function () {
      const StakingContract = await ethers.getContractFactory("StakingContract");
      
      // This should not revert at deployment but might cause issues later
      const stakingContract = await StakingContract.deploy(ethers.ZeroAddress);
      expect(await stakingContract.stakingToken()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Stake Function Error Cases", function () {
    it("Should revert when staking with insufficient balance", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      // Transfer all tokens away from user1 to create insufficient balance
      const userBalance = await stakingToken.balanceOf(user1.address);
      await stakingToken.connect(user1).transfer(stakingContract.target, userBalance);
      
      const stakeAmount = ethers.parseUnits("1000000", 18); // 1M tokens
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.revertedWithCustomError(stakingToken, "ERC20InsufficientBalance");
    });

    it("Should revert when staking with insufficient allowance", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      const insufficientAllowance = stakeAmount - ethers.parseUnits("1", 18);
      
      await stakingToken.connect(user1).approve(stakingContract.target, insufficientAllowance);
      
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.revertedWithCustomError(stakingToken, "ERC20InsufficientAllowance");
    });

    it("Should handle edge case where multiple users hit cap simultaneously", async function () {
      const { stakingContract, stakingToken, user1, user2 } = await loadFixture(deployAndStartStakingFixture);
      
      // Set up scenario where both users try to stake amounts that individually are fine
      // but together would exceed the cap
      const nearCapAmount = ethers.parseUnits("200000000", 18); // 200M
      const smallAmount = ethers.parseUnits("70000000", 18); // 70M (200M + 70M = 270M > 260M cap)
      
      // First user stakes
      await stakingToken.connect(user1).approve(stakingContract.target, nearCapAmount);
      await stakingContract.connect(user1).stake(nearCapAmount);
      
      // Second user should be rejected
      await stakingToken.connect(user2).approve(stakingContract.target, smallAmount);
      await expect(stakingContract.connect(user2).stake(smallAmount))
        .to.be.revertedWith("Exceeds maximum cap of 260M tokens");
    });

    it("Should handle stake amount of exactly 1 wei", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const oneWei = 1n;
      
      await stakingToken.connect(user1).approve(stakingContract.target, oneWei);
      
      await expect(stakingContract.connect(user1).stake(oneWei))
        .to.not.be.reverted;
      
      expect(await stakingContract.totalStaked()).to.equal(oneWei);
    });
  });

  describe("Claim Function Error Cases", function () {
    it("Should handle claim when contract has insufficient reward balance", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      
      // User stakes
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      // Don't deposit enough rewards - contract should fail when user tries to claim
      await time.increase(STAKING_DURATION + 1);
      
      await expect(stakingContract.connect(user1).claim())
        .to.be.revertedWithCustomError(stakingToken, "ERC20InsufficientBalance");
    });

    it("Should handle claim with partial reward balance", async function () {
      const { stakingContract, stakingToken, owner, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      const expectedReward = stakeAmount * BigInt(REWARD_PERCENTAGE) / 100n;
      const partialReward = expectedReward / 2n; // Only half the needed rewards
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      // Deposit only partial rewards
      await stakingToken.connect(owner).approve(stakingContract.target, partialReward);
      await stakingContract.connect(owner).depositRewards(partialReward);
      
      await time.increase(STAKING_DURATION + 1);
      
      await expect(stakingContract.connect(user1).claim())
        .to.be.revertedWithCustomError(stakingToken, "ERC20InsufficientBalance");
    });
  });

  describe("Owner Function Error Cases", function () {
    it("Should revert when non-owner tries to withdraw unused tokens", async function () {
      const { stakingContract, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      await time.increase(STAKING_DURATION + 1);
      
      const withdrawAmount = ethers.parseUnits("1000", 18);
      
      await expect(stakingContract.connect(user1).withdrawUnusedTokens(withdrawAmount))
        .to.be.revertedWithCustomError(stakingContract, "OwnableUnauthorizedAccount");
    });

    it("Should handle withdrawing more tokens than contract balance", async function () {
      const { stakingContract, stakingToken, owner } = await loadFixture(deployAndStartStakingFixture);
      
      // Deposit some tokens
      const depositAmount = ethers.parseUnits("1000", 18);
      await stakingToken.connect(owner).approve(stakingContract.target, depositAmount);
      await stakingContract.connect(owner).depositRewards(depositAmount);
      
      await time.increase(STAKING_DURATION + 1);
      
      // Try to withdraw more than deposited
      const excessiveWithdraw = ethers.parseUnits("2000", 18);
      
      await expect(stakingContract.connect(owner).withdrawUnusedTokens(excessiveWithdraw))
        .to.be.revertedWithCustomError(stakingToken, "ERC20InsufficientBalance");
    });

    it("Should handle deposit rewards with insufficient owner balance", async function () {
      const { stakingContract, stakingToken, owner } = await loadFixture(deployStakingFixture);
      
      const ownerBalance = await stakingToken.balanceOf(owner.address);
      const excessiveReward = ownerBalance + ethers.parseUnits("1", 18);
      
      await stakingToken.connect(owner).approve(stakingContract.target, excessiveReward);
      
      await expect(stakingContract.connect(owner).depositRewards(excessiveReward))
        .to.be.revertedWithCustomError(stakingToken, "ERC20InsufficientBalance");
    });
  });

  describe("Time Manipulation Edge Cases", function () {
    it("Should handle exactly at deposit window close", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployStakingFixture);
      
      await stakingContract.startStaking();
      const startTime = await stakingContract.startTime();
      
      // Move to just before the end of deposit window (still within window)
      await time.setNextBlockTimestamp(Number(startTime) + DEPOSIT_WINDOW - 1);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      
      // Should still work just before the boundary
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.not.be.reverted;
    });

    it("Should handle exactly at staking end time", async function () {
      const { stakingContract, stakingToken, owner, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      const expectedReward = stakeAmount * BigInt(REWARD_PERCENTAGE) / 100n;
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      await stakingToken.connect(owner).approve(stakingContract.target, expectedReward);
      await stakingContract.connect(owner).depositRewards(expectedReward);
      
      const endTime = await stakingContract.endTime();
      
      // Move to exactly the end time
      await time.setNextBlockTimestamp(Number(endTime));
      
      // Should be able to claim at the exact boundary
      await expect(stakingContract.connect(user1).claim())
        .to.not.be.reverted;
    });
  });

  describe("View Function Edge Cases", function () {
    it("Should return correct values for non-existent user", async function () {
      const { stakingContract, user1 } = await loadFixture(deployStakingFixture);
      
      const [stakedAmount, rewardAmount] = await stakingContract.calculateReward(user1.address);
      expect(stakedAmount).to.equal(0);
      expect(rewardAmount).to.equal(0);
      
      const userStake = await stakingContract.stakes(user1.address);
      expect(userStake.amount).to.equal(0);
      expect(userStake.claimed).to.be.false;
      
      const [userStakedAmount, claimed, potentialReward] = await stakingContract.getUserStakeInfo(user1.address);
      expect(userStakedAmount).to.equal(0);
      expect(claimed).to.be.false;
      expect(potentialReward).to.equal(0);
    });

    it("Should handle getTimeInfo before staking starts", async function () {
      const { stakingContract } = await loadFixture(deployStakingFixture);
      
      const [startTime, endTime, depositWindowEnd, currentTime] = await stakingContract.getTimeInfo();
      
      expect(startTime).to.equal(0);
      expect(endTime).to.equal(0);
      expect(depositWindowEnd).to.equal(DEPOSIT_WINDOW); // 0 + DEPOSIT_WINDOW
      expect(currentTime).to.be.greaterThan(0);
    });

    it("Should return correct remaining capacity when no one has staked", async function () {
      const { stakingContract } = await loadFixture(deployStakingFixture);
      
      expect(await stakingContract.getRemainingCapacity()).to.equal(MAX_TOTAL_STAKE);
      expect(await stakingContract.isCapReached()).to.be.false;
    });

    it("Should return correct status when exactly at cap", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      await stakingToken.connect(user1).approve(stakingContract.target, MAX_TOTAL_STAKE);
      await stakingContract.connect(user1).stake(MAX_TOTAL_STAKE);
      
      expect(await stakingContract.getRemainingCapacity()).to.equal(0);
      expect(await stakingContract.isCapReached()).to.be.true;
      expect(await stakingContract.totalStaked()).to.equal(MAX_TOTAL_STAKE);
    });
  });

  describe("Mathematical Edge Cases", function () {
    it("Should handle reward calculation with very small amounts", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      // Stake amount that would result in fractional reward
      const smallAmount = ethers.parseUnits("1", 15); // 0.001 tokens
      
      await stakingToken.connect(user1).approve(stakingContract.target, smallAmount);
      await stakingContract.connect(user1).stake(smallAmount);
      
      const [stakedAmount, rewardAmount] = await stakingContract.calculateReward(user1.address);
      
      expect(stakedAmount).to.equal(smallAmount);
      // Reward should be (smallAmount * 15) / 100, which might be 0 due to integer division
      expect(rewardAmount).to.equal(smallAmount * BigInt(REWARD_PERCENTAGE) / 100n);
    });

    it("Should handle reward calculation overflow protection", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      // Use maximum possible stake
      const maxStake = MAX_TOTAL_STAKE;
      
      await stakingToken.connect(user1).approve(stakingContract.target, maxStake);
      await stakingContract.connect(user1).stake(maxStake);
      
      const [stakedAmount, rewardAmount] = await stakingContract.calculateReward(user1.address);
      
      expect(stakedAmount).to.equal(maxStake);
      expect(rewardAmount).to.equal(maxStake * BigInt(REWARD_PERCENTAGE) / 100n);
      
      // Verify no overflow occurred by checking the calculation makes sense
      const expectedReward = (maxStake * BigInt(15)) / BigInt(100);
      expect(rewardAmount).to.equal(expectedReward);
    });
  });

  describe("State Consistency Edge Cases", function () {
    it("Should maintain correct stakers array after multiple stakes", async function () {
      const { stakingContract, stakingToken, user1, user2, user3 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      
      // Multiple users stake
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      await stakingToken.connect(user2).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user2).stake(stakeAmount);
      
      await stakingToken.connect(user3).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user3).stake(stakeAmount);
      
      expect(await stakingContract.getTotalStakers()).to.equal(3);
      expect(await stakingContract.totalStaked()).to.equal(stakeAmount * 3n);
      
      // Check that stakers are recorded correctly
      expect(await stakingContract.stakers(0)).to.equal(user1.address);
      expect(await stakingContract.stakers(1)).to.equal(user2.address);
      expect(await stakingContract.stakers(2)).to.equal(user3.address);
    });

    it("Should maintain state consistency after claims", async function () {
      const { stakingContract, stakingToken, owner, user1, user2 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      const totalRewards = stakeAmount * 2n * BigInt(REWARD_PERCENTAGE) / 100n;
      
      // Two users stake
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      await stakingToken.connect(user2).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user2).stake(stakeAmount);
      
      // Deposit rewards
      await stakingToken.connect(owner).approve(stakingContract.target, totalRewards);
      await stakingContract.connect(owner).depositRewards(totalRewards);
      
      await time.increase(STAKING_DURATION + 1);
      
      // First user claims
      await stakingContract.connect(user1).claim();
      
      // Check state consistency
      const user1Stake = await stakingContract.stakes(user1.address);
      const user2Stake = await stakingContract.stakes(user2.address);
      
      expect(user1Stake.claimed).to.be.true;
      expect(user1Stake.amount).to.equal(stakeAmount); // Amount should remain
      expect(user2Stake.claimed).to.be.false;
      expect(user2Stake.amount).to.equal(stakeAmount);
      
      // Total staked should remain unchanged
      expect(await stakingContract.totalStaked()).to.equal(stakeAmount * 2n);
      expect(await stakingContract.getTotalStakers()).to.equal(2);
    });
  });
});
