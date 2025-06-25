const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingContract - Incremental Staking", function () {
  let stakingContract;
  let token;
  let owner;
  let user1;
  let user2;
  let user3;

  const INITIAL_SUPPLY = ethers.parseUnits("2000000000", 18); // 2B tokens
  const DEPOSIT_WINDOW = 24 * 60 * 60; // 24 hours
  const STAKING_DURATION = 14 * 24 * 60 * 60; // 14 days
  const MAX_TOTAL_STAKE = ethers.parseUnits("150000000", 18); // 150M tokens

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token = await MockERC20.deploy("Test Token", "TEST", INITIAL_SUPPLY);

    // Deploy staking contract
    const StakingContract = await ethers.getContractFactory("StakingContract");
    stakingContract = await StakingContract.deploy(await token.getAddress());

    // Distribute tokens to users
    const userAmount = ethers.parseUnits("200000000", 18); // 200M tokens each (increased for cap tests)
    await token.transfer(user1.address, userAmount);
    await token.transfer(user2.address, userAmount);
    await token.transfer(user3.address, userAmount);

    // Start staking
    await stakingContract.startStaking();
  });

  describe("Basic Incremental Staking", function () {
    it("Should allow user to stake multiple times during deposit window", async function () {
      const firstStake = ethers.parseUnits("1000", 18);
      const secondStake = ethers.parseUnits("500", 18);
      const thirdStake = ethers.parseUnits("300", 18);

      // Approve tokens
      await token.connect(user1).approve(await stakingContract.getAddress(), firstStake + secondStake + thirdStake);

      // First stake
      await expect(stakingContract.connect(user1).stake(firstStake))
        .to.emit(stakingContract, "Staked")
        .withArgs(user1.address, firstStake);

      // Check stake info after first stake
      const [amount1, claimed1] = await stakingContract.getUserStakeInfo(user1.address);
      expect(amount1).to.equal(firstStake);
      expect(claimed1).to.be.false;

      // Second stake (increment)
      await expect(stakingContract.connect(user1).stake(secondStake))
        .to.emit(stakingContract, "StakeIncreased")
        .withArgs(user1.address, secondStake, firstStake + secondStake);

      // Check stake info after second stake
      const [amount2, claimed2] = await stakingContract.getUserStakeInfo(user1.address);
      expect(amount2).to.equal(firstStake + secondStake);
      expect(claimed2).to.be.false;

      // Third stake (increment again)
      await expect(stakingContract.connect(user1).stake(thirdStake))
        .to.emit(stakingContract, "StakeIncreased")
        .withArgs(user1.address, thirdStake, firstStake + secondStake + thirdStake);

      // Check final stake info
      const [finalAmount, finalClaimed] = await stakingContract.getUserStakeInfo(user1.address);
      expect(finalAmount).to.equal(firstStake + secondStake + thirdStake);
      expect(finalClaimed).to.be.false;

      // Check total staked
      expect(await stakingContract.totalStaked()).to.equal(firstStake + secondStake + thirdStake);
    });

    it("Should only add user to stakers array once", async function () {
      const firstStake = ethers.parseUnits("1000", 18);
      const secondStake = ethers.parseUnits("500", 18);

      await token.connect(user1).approve(await stakingContract.getAddress(), firstStake + secondStake);

      // Check initial stakers count
      expect(await stakingContract.getTotalStakers()).to.equal(0);

      // First stake
      await stakingContract.connect(user1).stake(firstStake);
      expect(await stakingContract.getTotalStakers()).to.equal(1);

      // Second stake (should not increase stakers count)
      await stakingContract.connect(user1).stake(secondStake);
      expect(await stakingContract.getTotalStakers()).to.equal(1);

      // Verify user is in stakers array
      expect(await stakingContract.stakers(0)).to.equal(user1.address);
    });

    it("Should emit correct events for first stake vs incremental stakes", async function () {
      const firstStake = ethers.parseUnits("1000", 18);
      const secondStake = ethers.parseUnits("500", 18);

      await token.connect(user1).approve(await stakingContract.getAddress(), firstStake + secondStake);

      // First stake should emit Staked event
      await expect(stakingContract.connect(user1).stake(firstStake))
        .to.emit(stakingContract, "Staked")
        .withArgs(user1.address, firstStake)
        .and.not.to.emit(stakingContract, "StakeIncreased");

      // Second stake should emit StakeIncreased event
      await expect(stakingContract.connect(user1).stake(secondStake))
        .to.emit(stakingContract, "StakeIncreased")
        .withArgs(user1.address, secondStake, firstStake + secondStake)
        .and.not.to.emit(stakingContract, "Staked");
    });
  });

  describe("Multiple Users with Incremental Staking", function () {
    it("Should handle multiple users each making incremental stakes", async function () {
      const stake1 = ethers.parseUnits("1000", 18);
      const stake2 = ethers.parseUnits("500", 18);
      const stake3 = ethers.parseUnits("750", 18);

      // Approve tokens for all users
      await token.connect(user1).approve(await stakingContract.getAddress(), stake1 + stake2);
      await token.connect(user2).approve(await stakingContract.getAddress(), stake2 + stake3);
      await token.connect(user3).approve(await stakingContract.getAddress(), stake1);

      // User1: Two stakes
      await stakingContract.connect(user1).stake(stake1);
      await stakingContract.connect(user1).stake(stake2);

      // User2: Two stakes  
      await stakingContract.connect(user2).stake(stake2);
      await stakingContract.connect(user2).stake(stake3);

      // User3: One stake
      await stakingContract.connect(user3).stake(stake1);

      // Verify final amounts
      const [amount1] = await stakingContract.getUserStakeInfo(user1.address);
      const [amount2] = await stakingContract.getUserStakeInfo(user2.address);
      const [amount3] = await stakingContract.getUserStakeInfo(user3.address);

      expect(amount1).to.equal(stake1 + stake2);
      expect(amount2).to.equal(stake2 + stake3);
      expect(amount3).to.equal(stake1);

      // Verify total staked
      const expectedTotal = (stake1 + stake2) + (stake2 + stake3) + stake1;
      expect(await stakingContract.totalStaked()).to.equal(expectedTotal);

      // Verify stakers count
      expect(await stakingContract.getTotalStakers()).to.equal(3);
    });
  });

  describe("Cap Enforcement with Incremental Staking", function () {
    it("Should prevent incremental stake that would exceed cap", async function () {
      const largeStake = ethers.parseUnits("30000000", 18); // 30M
      const incrementStake = ethers.parseUnits("30000000", 18); // 30M

      await token.connect(user1).approve(await stakingContract.getAddress(), largeStake + incrementStake);

      // First large stake
      await stakingContract.connect(user1).stake(largeStake);
      expect(await stakingContract.totalStaked()).to.equal(largeStake);

      // Add user2 with large stake to approach cap
      const user2Stake = ethers.parseUnits("100000000", 18); // 100M 
      await token.connect(user2).approve(await stakingContract.getAddress(), user2Stake);
      await stakingContract.connect(user2).stake(user2Stake);

      // Now total is 130M, trying to add 30M more would give 160M, exceeding 150M cap
      await expect(
        stakingContract.connect(user1).stake(incrementStake)
      ).to.be.revertedWith("Exceeds maximum cap of 150M tokens");

      // Verify stake wasn't changed
      const [amount] = await stakingContract.getUserStakeInfo(user1.address);
      expect(amount).to.equal(largeStake);
    });

    it("Should allow incremental stake up to exact cap", async function () {
      const firstStake = ethers.parseUnits("20000000", 18); // 20M
      const secondStake = ethers.parseUnits("10000000", 18);  // 10M

      await token.connect(user1).approve(await stakingContract.getAddress(), firstStake + secondStake);

      // First stake
      await stakingContract.connect(user1).stake(firstStake);

      // Add other users to approach cap
      const user2Stake = ethers.parseUnits("60000000", 18); // 60M
      const user3Stake = ethers.parseUnits("60000000", 18); // 60M
      
      await token.connect(user2).approve(await stakingContract.getAddress(), user2Stake);
      await token.connect(user3).approve(await stakingContract.getAddress(), user3Stake);
      
      await stakingContract.connect(user2).stake(user2Stake);
      await stakingContract.connect(user3).stake(user3Stake);

      // Now total is 140M, user1 can add 10M to reach exactly 150M
      await stakingContract.connect(user1).stake(secondStake);

      // Verify total is exactly at cap
      expect(await stakingContract.totalStaked()).to.equal(MAX_TOTAL_STAKE);
      expect(await stakingContract.isCapReached()).to.be.true;

      // Verify user's total stake
      const [amount] = await stakingContract.getUserStakeInfo(user1.address);
      expect(amount).to.equal(firstStake + secondStake);
    });
  });

  describe("Time Window Restrictions", function () {
    it("Should not allow incremental staking after deposit window closes", async function () {
      const firstStake = ethers.parseUnits("1000", 18);
      const secondStake = ethers.parseUnits("500", 18);

      await token.connect(user1).approve(await stakingContract.getAddress(), firstStake + secondStake);

      // First stake during window
      await stakingContract.connect(user1).stake(firstStake);

      // Fast forward past deposit window
      await ethers.provider.send("evm_increaseTime", [DEPOSIT_WINDOW + 1]);
      await ethers.provider.send("evm_mine");

      // Try to increment stake after window closes
      await expect(
        stakingContract.connect(user1).stake(secondStake)
      ).to.be.revertedWith("Deposit window closed");

      // Verify stake wasn't changed
      const [amount] = await stakingContract.getUserStakeInfo(user1.address);
      expect(amount).to.equal(firstStake);
    });

    it("Should allow incremental staking near end of deposit window", async function () {
      const firstStake = ethers.parseUnits("1000", 18);
      const secondStake = ethers.parseUnits("500", 18);

      await token.connect(user1).approve(await stakingContract.getAddress(), firstStake + secondStake);

      // First stake
      await stakingContract.connect(user1).stake(firstStake);

      // Fast forward to near end of deposit window (5 seconds before it closes)
      await ethers.provider.send("evm_increaseTime", [DEPOSIT_WINDOW - 5]);
      await ethers.provider.send("evm_mine");

      // Should still be able to stake near the boundary
      await stakingContract.connect(user1).stake(secondStake);

      // Verify final amount
      const [amount] = await stakingContract.getUserStakeInfo(user1.address);
      expect(amount).to.equal(firstStake + secondStake);
    });
  });

  describe("Reward Calculation with Incremental Staking", function () {
    it("Should calculate rewards based on total staked amount", async function () {
      const firstStake = ethers.parseUnits("1000", 18);
      const secondStake = ethers.parseUnits("500", 18);
      const totalStake = firstStake + secondStake;

      await token.connect(user1).approve(await stakingContract.getAddress(), totalStake);

      // Stake in two increments
      await stakingContract.connect(user1).stake(firstStake);
      await stakingContract.connect(user1).stake(secondStake);

      // Calculate expected reward (10% of total)
      const expectedReward = (totalStake * 10n) / 100n;

      // Check reward calculation
      const [stakedAmount, rewardAmount] = await stakingContract.calculateReward(user1.address);
      expect(stakedAmount).to.equal(totalStake);
      expect(rewardAmount).to.equal(expectedReward);
    });

    it("Should allow claiming with correct rewards after incremental staking", async function () {
      const firstStake = ethers.parseUnits("1000", 18);
      const secondStake = ethers.parseUnits("500", 18);
      const totalStake = firstStake + secondStake;
      const expectedReward = (totalStake * 10n) / 100n;

      await token.connect(user1).approve(await stakingContract.getAddress(), totalStake);

      // Stake in increments
      await stakingContract.connect(user1).stake(firstStake);
      await stakingContract.connect(user1).stake(secondStake);

      // Deposit rewards to contract
      const rewardAmount = ethers.parseUnits("50000", 18);
      await token.connect(owner).approve(await stakingContract.getAddress(), rewardAmount);
      await stakingContract.connect(owner).depositRewards(rewardAmount);

      // Fast forward past staking period
      await ethers.provider.send("evm_increaseTime", [STAKING_DURATION + 1]);
      await ethers.provider.send("evm_mine");

      // Record initial balance
      const initialBalance = await token.balanceOf(user1.address);

      // Claim
      await expect(stakingContract.connect(user1).claim())
        .to.emit(stakingContract, "Claimed")
        .withArgs(user1.address, totalStake, expectedReward);

      // Verify balance increase
      const finalBalance = await token.balanceOf(user1.address);
      expect(finalBalance - initialBalance).to.equal(totalStake + expectedReward);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small incremental stakes", async function () {
      const firstStake = 1n; // 1 wei
      const secondStake = 1n; // 1 wei

      await token.connect(user1).approve(await stakingContract.getAddress(), firstStake + secondStake);

      await stakingContract.connect(user1).stake(firstStake);
      await stakingContract.connect(user1).stake(secondStake);

      const [amount] = await stakingContract.getUserStakeInfo(user1.address);
      expect(amount).to.equal(firstStake + secondStake);
    });

    it("Should handle maximum number of incremental stakes", async function () {
      const stakeAmount = ethers.parseUnits("100", 18);
      const numStakes = 10;
      const totalAmount = stakeAmount * BigInt(numStakes);

      await token.connect(user1).approve(await stakingContract.getAddress(), totalAmount);

      // Make multiple incremental stakes
      for (let i = 0; i < numStakes; i++) {
        await stakingContract.connect(user1).stake(stakeAmount);
      }

      // Verify final amount
      const [amount] = await stakingContract.getUserStakeInfo(user1.address);
      expect(amount).to.equal(totalAmount);

      // Verify only counted as one staker
      expect(await stakingContract.getTotalStakers()).to.equal(1);
    });

    it("Should maintain state consistency with mixed users and incremental stakes", async function () {
      const stake1 = ethers.parseUnits("1000", 18);
      const stake2 = ethers.parseUnits("500", 18);

      // Approve tokens
      await token.connect(user1).approve(await stakingContract.getAddress(), stake1 + stake2);
      await token.connect(user2).approve(await stakingContract.getAddress(), stake1);

      // User1: incremental staking
      await stakingContract.connect(user1).stake(stake1);
      await stakingContract.connect(user1).stake(stake2);

      // User2: single stake
      await stakingContract.connect(user2).stake(stake1);

      // Verify state consistency
      expect(await stakingContract.getTotalStakers()).to.equal(2);
      expect(await stakingContract.totalStaked()).to.equal(stake1 + stake2 + stake1);

      const [amount1] = await stakingContract.getUserStakeInfo(user1.address);
      const [amount2] = await stakingContract.getUserStakeInfo(user2.address);

      expect(amount1).to.equal(stake1 + stake2);
      expect(amount2).to.equal(stake1);
    });
  });
});
