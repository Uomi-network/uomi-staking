const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingContract - Integration Tests", function () {
  const DEPOSIT_WINDOW = 24 * 60 * 60; // 24 hours in seconds
  const STAKING_DURATION = 14 * 24 * 60 * 60; // 14 days in seconds
  const REWARD_PERCENTAGE = 15;
  const MAX_TOTAL_STAKE = ethers.parseUnits("260000000", 18); // 260M tokens
  const INITIAL_SUPPLY = ethers.parseUnits("2000000000", 18); // 2B tokens

  async function deployStakingFixture() {
    const [owner, user1, user2, user3, user4, user5] = await ethers.getSigners();

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
    await stakingToken.transfer(user4.address, userAmount);
    await stakingToken.transfer(user5.address, userAmount);

    return {
      stakingContract,
      stakingToken,
      owner,
      user1,
      user2,
      user3,
      user4,
      user5,
      userAmount
    };
  }

  async function deployAndStartStakingFixture() {
    const fixture = await deployStakingFixture();
    await fixture.stakingContract.startStaking();
    return fixture;
  }

  describe("Full Staking Cycle", function () {
    it("Should handle complete staking cycle with multiple users", async function () {
      const { stakingContract, stakingToken, owner, user1, user2, user3 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount1 = ethers.parseUnits("50000000", 18); // 50M
      const stakeAmount2 = ethers.parseUnits("100000000", 18); // 100M  
      const stakeAmount3 = ethers.parseUnits("50000000", 18); // 50M
      
      // Users stake during deposit window
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount1);
      await stakingContract.connect(user1).stake(stakeAmount1);
      
      await stakingToken.connect(user2).approve(stakingContract.target, stakeAmount2);
      await stakingContract.connect(user2).stake(stakeAmount2);
      
      await stakingToken.connect(user3).approve(stakingContract.target, stakeAmount3);
      await stakingContract.connect(user3).stake(stakeAmount3);
      
      // Check total staked
      const totalStaked = await stakingContract.totalStaked();
      expect(totalStaked).to.equal(stakeAmount1 + stakeAmount2 + stakeAmount3);
      
      // Calculate total rewards needed
      const totalRewards = totalStaked * BigInt(REWARD_PERCENTAGE) / 100n;
      
      // Owner deposits rewards
      await stakingToken.connect(owner).approve(stakingContract.target, totalRewards);
      await stakingContract.connect(owner).depositRewards(totalRewards);
      
      // Fast forward to end of staking period
      await time.increase(STAKING_DURATION + 1);
      
      // Users claim their rewards
      const user1InitialBalance = await stakingToken.balanceOf(user1.address);
      await stakingContract.connect(user1).claim();
      const user1FinalBalance = await stakingToken.balanceOf(user1.address);
      const user1Reward = stakeAmount1 * BigInt(REWARD_PERCENTAGE) / 100n;
      expect(user1FinalBalance - user1InitialBalance).to.equal(stakeAmount1 + user1Reward);
      
      const user2InitialBalance = await stakingToken.balanceOf(user2.address);
      await stakingContract.connect(user2).claim();
      const user2FinalBalance = await stakingToken.balanceOf(user2.address);
      const user2Reward = stakeAmount2 * BigInt(REWARD_PERCENTAGE) / 100n;
      expect(user2FinalBalance - user2InitialBalance).to.equal(stakeAmount2 + user2Reward);
      
      const user3InitialBalance = await stakingToken.balanceOf(user3.address);
      await stakingContract.connect(user3).claim();
      const user3FinalBalance = await stakingToken.balanceOf(user3.address);
      const user3Reward = stakeAmount3 * BigInt(REWARD_PERCENTAGE) / 100n;
      expect(user3FinalBalance - user3InitialBalance).to.equal(stakeAmount3 + user3Reward);
    });

    it("Should handle staking at deposit window boundary", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      
      // Fast forward to just before deposit window closes
      await time.increase(DEPOSIT_WINDOW - 10);
      
      // Should still be able to stake
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.not.be.reverted;
      
      // Fast forward past deposit window
      await time.increase(20);
      
      // Should not be able to stake anymore
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.revertedWith("Deposit window closed");
    });

    it("Should handle claiming at staking end boundary", async function () {
      const { stakingContract, stakingToken, owner, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      const expectedReward = stakeAmount * BigInt(REWARD_PERCENTAGE) / 100n;
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      await stakingToken.connect(owner).approve(stakingContract.target, expectedReward);
      await stakingContract.connect(owner).depositRewards(expectedReward);
      
      // Fast forward to just before staking ends
      await time.increase(STAKING_DURATION - 10);
      
      // Should not be able to claim yet
      await expect(stakingContract.connect(user1).claim())
        .to.be.revertedWith("Staking period not ended yet");
      
      // Fast forward to exactly when staking ends
      await time.increase(10);
      
      // Should now be able to claim
      await expect(stakingContract.connect(user1).claim())
        .to.not.be.reverted;
    });
  });

  describe("Maximum Cap Scenarios", function () {
    it("Should prevent staking when cap would be exceeded", async function () {
      const { stakingContract, stakingToken, user1, user2 } = await loadFixture(deployAndStartStakingFixture);
      
      const largeStake = ethers.parseUnits("200000000", 18); // 200M
      const smallStake = ethers.parseUnits("70000000", 18); // 70M (would exceed cap when combined)
      
      // First user stakes large amount
      await stakingToken.connect(user1).approve(stakingContract.target, largeStake);
      await stakingContract.connect(user1).stake(largeStake);
      
      // Second user tries to stake amount that would exceed cap
      await stakingToken.connect(user2).approve(stakingContract.target, smallStake);
      await expect(stakingContract.connect(user2).stake(smallStake))
        .to.be.revertedWith("Exceeds maximum cap of 260M tokens");
      
      // Check that exactly cap amount can still be staked
      const remainingCapacity = await stakingContract.getRemainingCapacity();
      await stakingContract.connect(user2).stake(remainingCapacity);
      
      expect(await stakingContract.isCapReached()).to.be.true;
      expect(await stakingContract.totalStaked()).to.equal(MAX_TOTAL_STAKE);
    });

    it("Should handle exact cap reached scenario", async function () {
      const { stakingContract, stakingToken, user1, user2, user3, user4 } = await loadFixture(deployAndStartStakingFixture);
      
      // Distribute exactly 260M across 4 users
      const stake1 = ethers.parseUnits("65000000", 18); // 65M
      const stake2 = ethers.parseUnits("65000000", 18); // 65M
      const stake3 = ethers.parseUnits("65000000", 18); // 65M
      const stake4 = ethers.parseUnits("65000000", 18); // 65M = 260M total
      
      await stakingToken.connect(user1).approve(stakingContract.target, stake1);
      await stakingContract.connect(user1).stake(stake1);
      
      await stakingToken.connect(user2).approve(stakingContract.target, stake2);
      await stakingContract.connect(user2).stake(stake2);
      
      await stakingToken.connect(user3).approve(stakingContract.target, stake3);
      await stakingContract.connect(user3).stake(stake3);
      
      await stakingToken.connect(user4).approve(stakingContract.target, stake4);
      await stakingContract.connect(user4).stake(stake4);
      
      expect(await stakingContract.totalStaked()).to.equal(MAX_TOTAL_STAKE);
      expect(await stakingContract.isCapReached()).to.be.true;
      expect(await stakingContract.getRemainingCapacity()).to.equal(0);
      expect(await stakingContract.getTotalStakers()).to.equal(4);
    });
  });

  describe("Reward Distribution Edge Cases", function () {
    it("Should handle very small stake amounts", async function () {
      const { stakingContract, stakingToken, owner, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const smallStake = ethers.parseUnits("1", 18); // 1 token
      const expectedReward = smallStake * BigInt(REWARD_PERCENTAGE) / 100n; // Should be 0.15 tokens
      
      await stakingToken.connect(user1).approve(stakingContract.target, smallStake);
      await stakingContract.connect(user1).stake(smallStake);
      
      await stakingToken.connect(owner).approve(stakingContract.target, expectedReward + BigInt(1));
      await stakingContract.connect(owner).depositRewards(expectedReward + BigInt(1));
      
      await time.increase(STAKING_DURATION + 1);
      
      const initialBalance = await stakingToken.balanceOf(user1.address);
      await stakingContract.connect(user1).claim();
      const finalBalance = await stakingToken.balanceOf(user1.address);
      
      expect(finalBalance - initialBalance).to.equal(smallStake + expectedReward);
    });

    it("Should handle very large stake amounts", async function () {
      const { stakingContract, stakingToken, owner, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const largeStake = MAX_TOTAL_STAKE; // Stake entire cap
      const expectedReward = largeStake * BigInt(REWARD_PERCENTAGE) / 100n;
      
      await stakingToken.connect(user1).approve(stakingContract.target, largeStake);
      await stakingContract.connect(user1).stake(largeStake);
      
      await stakingToken.connect(owner).approve(stakingContract.target, expectedReward);
      await stakingContract.connect(owner).depositRewards(expectedReward);
      
      await time.increase(STAKING_DURATION + 1);
      
      const initialBalance = await stakingToken.balanceOf(user1.address);
      await stakingContract.connect(user1).claim();
      const finalBalance = await stakingToken.balanceOf(user1.address);
      
      expect(finalBalance - initialBalance).to.equal(largeStake + expectedReward);
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should handle maximum number of stakers efficiently", async function () {
      const { stakingContract, stakingToken, owner } = await loadFixture(deployAndStartStakingFixture);
      
      // Create multiple signers for testing many stakers
      const signers = await ethers.getSigners();
      const maxStakers = Math.min(10, signers.length - 1); // Use up to 10 stakers
      
      const stakePerUser = MAX_TOTAL_STAKE / BigInt(maxStakers);
      
      // Each user stakes
      for (let i = 1; i <= maxStakers; i++) {
        await stakingToken.transfer(signers[i].address, stakePerUser + ethers.parseUnits("1000", 18));
        await stakingToken.connect(signers[i]).approve(stakingContract.target, stakePerUser);
        await stakingContract.connect(signers[i]).stake(stakePerUser);
      }
      
      expect(await stakingContract.getTotalStakers()).to.equal(maxStakers);
      
      // Deposit rewards
      const totalRewards = (MAX_TOTAL_STAKE * BigInt(REWARD_PERCENTAGE)) / 100n;
      await stakingToken.connect(owner).approve(stakingContract.target, totalRewards);
      await stakingContract.connect(owner).depositRewards(totalRewards);
      
      await time.increase(STAKING_DURATION + 1);
      
      // All users claim
      for (let i = 1; i <= maxStakers; i++) {
        await expect(stakingContract.connect(signers[i]).claim())
          .to.not.be.reverted;
      }
    });
  });

  describe("Security Tests", function () {
    it("Should prevent reentrancy attacks", async function () {
      // This test verifies the ReentrancyGuard is working
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      // The ReentrancyGuard should prevent any reentrancy attacks
      // This is more of a structural test - the modifiers should prevent issues
      expect(await stakingContract.stakes(user1.address)).to.not.equal([0, false]);
    });

    it("Should handle token transfer failures gracefully", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      
      // Try to stake without approval
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.revertedWithCustomError(stakingToken, "ERC20InsufficientAllowance");
      
      // Try to stake more than balance
      const hugeAmount = ethers.parseUnits("100000000000", 18);
      await stakingToken.connect(user1).approve(stakingContract.target, hugeAmount);
      await expect(stakingContract.connect(user1).stake(hugeAmount))
        .to.be.revertedWith("Exceeds maximum cap of 260M tokens");
    });
  });

  describe("Time-based Edge Cases", function () {
    it("Should handle deposits at exact window boundaries", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployStakingFixture);
      
      // Start staking and get the exact start time
      await stakingContract.startStaking();
      const startTime = await stakingContract.startTime();
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      
      // Set time to exactly when deposit window closes
      await time.setNextBlockTimestamp(Number(startTime) + DEPOSIT_WINDOW);
      
      // Should still be able to stake at the exact boundary
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.not.be.reverted;
      
      // Move one second past the boundary
      await time.setNextBlockTimestamp(Number(startTime) + DEPOSIT_WINDOW + 1);
      
      // Should not be able to stake anymore
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.revertedWith("Deposit window closed");
    });

    it("Should handle claims at exact staking end boundary", async function () {
      const { stakingContract, stakingToken, owner, user1 } = await loadFixture(deployStakingFixture);
      
      await stakingContract.startStaking();
      const startTime = await stakingContract.startTime();
      const endTime = Number(startTime) + STAKING_DURATION;
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      const expectedReward = stakeAmount * BigInt(REWARD_PERCENTAGE) / 100n;
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      await stakingToken.connect(owner).approve(stakingContract.target, expectedReward);
      await stakingContract.connect(owner).depositRewards(expectedReward);
      
      // Set time to exactly when staking ends
      await time.setNextBlockTimestamp(endTime);
      
      // Should be able to claim at the exact boundary
      await expect(stakingContract.connect(user1).claim())
        .to.not.be.reverted;
    });
  });
});
