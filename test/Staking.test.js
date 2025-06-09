const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingContract", function () {
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
    const userAmount = ethers.parseUnits("300000000", 18); // 300M tokens each (more than enough)
    await stakingToken.transfer(user1.address, userAmount);
    await stakingToken.transfer(user2.address, userAmount);
    await stakingToken.transfer(user3.address, userAmount);

    // Transfer reward tokens to owner for depositing rewards
    const rewardAmount = ethers.parseUnits("50000000", 18); // 50M tokens for rewards
    await stakingToken.transfer(owner.address, rewardAmount);

    return {
      stakingContract,
      stakingToken,
      owner,
      user1,
      user2,
      user3,
      userAmount,
      rewardAmount
    };
  }

  async function deployAndStartStakingFixture() {
    const fixture = await deployStakingFixture();
    await fixture.stakingContract.startStaking();
    return fixture;
  }

  describe("Deployment", function () {
    it("Should set the correct staking token", async function () {
      const { stakingContract, stakingToken } = await loadFixture(deployStakingFixture);
      expect(await stakingContract.stakingToken()).to.equal(stakingToken.target);
    });

    it("Should set the correct owner", async function () {
      const { stakingContract, owner } = await loadFixture(deployStakingFixture);
      expect(await stakingContract.owner()).to.equal(owner.address);
    });

    it("Should have correct constants", async function () {
      const { stakingContract } = await loadFixture(deployStakingFixture);
      
      expect(await stakingContract.DEPOSIT_WINDOW()).to.equal(DEPOSIT_WINDOW);
      expect(await stakingContract.STAKING_DURATION()).to.equal(STAKING_DURATION);
      expect(await stakingContract.REWARD_PERCENTAGE()).to.equal(REWARD_PERCENTAGE);
      expect(await stakingContract.MAX_TOTAL_STAKE()).to.equal(MAX_TOTAL_STAKE);
    });

    it("Should initialize with zero values", async function () {
      const { stakingContract } = await loadFixture(deployStakingFixture);
      
      expect(await stakingContract.startTime()).to.equal(0);
      expect(await stakingContract.endTime()).to.equal(0);
      expect(await stakingContract.totalStaked()).to.equal(0);
      expect(await stakingContract.getTotalStakers()).to.equal(0);
    });
  });

  describe("Start Staking", function () {
    it("Should allow owner to start staking", async function () {
      const { stakingContract, owner } = await loadFixture(deployStakingFixture);
      
      await expect(stakingContract.startStaking())
        .to.emit(stakingContract, "StakingStarted");
      
      const startTime = await stakingContract.startTime();
      const endTime = await stakingContract.endTime();
      
      expect(startTime).to.be.greaterThan(0);
      expect(endTime).to.equal(startTime + BigInt(STAKING_DURATION));
    });

    it("Should not allow non-owner to start staking", async function () {
      const { stakingContract, user1 } = await loadFixture(deployStakingFixture);
      
      await expect(stakingContract.connect(user1).startStaking())
        .to.be.revertedWithCustomError(stakingContract, "OwnableUnauthorizedAccount");
    });

    it("Should not allow starting staking twice", async function () {
      const { stakingContract } = await loadFixture(deployStakingFixture);
      
      await stakingContract.startStaking();
      
      await expect(stakingContract.startStaking())
        .to.be.revertedWith("Staking already started");
    });
  });

  describe("Deposit Window Status", function () {
    it("Should return false before staking starts", async function () {
      const { stakingContract } = await loadFixture(deployStakingFixture);
      
      expect(await stakingContract.isDepositWindowOpen()).to.be.false;
    });

    it("Should return true during deposit window", async function () {
      const { stakingContract } = await loadFixture(deployAndStartStakingFixture);
      
      expect(await stakingContract.isDepositWindowOpen()).to.be.true;
    });

    it("Should return false after deposit window closes", async function () {
      const { stakingContract } = await loadFixture(deployAndStartStakingFixture);
      
      await time.increase(DEPOSIT_WINDOW + 1);
      
      expect(await stakingContract.isDepositWindowOpen()).to.be.false;
    });
  });

  describe("Staking", function () {
    it("Should allow user to stake during deposit window", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18); // 1M tokens
      
      // Approve tokens
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.emit(stakingContract, "Staked")
        .withArgs(user1.address, stakeAmount);
      
      const userStake = await stakingContract.stakes(user1.address);
      expect(userStake.amount).to.equal(stakeAmount);
      expect(userStake.claimed).to.be.false;
      
      expect(await stakingContract.totalStaked()).to.equal(stakeAmount);
      expect(await stakingContract.getTotalStakers()).to.equal(1);
    });

    it("Should not allow staking before deposit window opens", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.revertedWith("Staking not started yet");
    });

    it("Should not allow staking after deposit window closes", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      await time.increase(DEPOSIT_WINDOW + 1);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.revertedWith("Deposit window closed");
    });

    it("Should not allow staking zero amount", async function () {
      const { stakingContract, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      await expect(stakingContract.connect(user1).stake(0))
        .to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should allow user to increase stake during deposit window", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const firstStake = ethers.parseUnits("1000000", 18);
      const secondStake = ethers.parseUnits("500000", 18);
      
      await stakingToken.connect(user1).approve(stakingContract.target, firstStake + secondStake);
      
      // First stake should emit Staked event
      await expect(stakingContract.connect(user1).stake(firstStake))
        .to.emit(stakingContract, "Staked")
        .withArgs(user1.address, firstStake);
      
      // Second stake should emit StakeIncreased event
      await expect(stakingContract.connect(user1).stake(secondStake))
        .to.emit(stakingContract, "StakeIncreased")
        .withArgs(user1.address, secondStake, firstStake + secondStake);

      // Verify total stake
      const [userStake] = await stakingContract.getUserStakeInfo(user1.address);
      expect(userStake).to.equal(firstStake + secondStake);
      
      // Verify only counted as one staker
      expect(await stakingContract.getTotalStakers()).to.equal(1);
    });

    it("Should not allow staking beyond max cap", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = MAX_TOTAL_STAKE + ethers.parseUnits("1", 18);
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      
      await expect(stakingContract.connect(user1).stake(stakeAmount))
        .to.be.revertedWith("Exceeds maximum cap of 260M tokens");
    });

    it("Should handle multiple users staking", async function () {
      const { stakingContract, stakingToken, user1, user2, user3 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount1 = ethers.parseUnits("50000000", 18); // 50M
      const stakeAmount2 = ethers.parseUnits("100000000", 18); // 100M
      const stakeAmount3 = ethers.parseUnits("110000000", 18); // 110M (total = 260M, exactly at cap)
      
      // User 1 stakes
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount1);
      await stakingContract.connect(user1).stake(stakeAmount1);
      
      // User 2 stakes
      await stakingToken.connect(user2).approve(stakingContract.target, stakeAmount2);
      await stakingContract.connect(user2).stake(stakeAmount2);
      
      // User 3 stakes (reaches exactly the cap)
      await stakingToken.connect(user3).approve(stakingContract.target, stakeAmount3);
      await stakingContract.connect(user3).stake(stakeAmount3);
      
      expect(await stakingContract.totalStaked()).to.equal(MAX_TOTAL_STAKE);
      expect(await stakingContract.getTotalStakers()).to.equal(3);
      expect(await stakingContract.isCapReached()).to.be.true;
      expect(await stakingContract.getRemainingCapacity()).to.equal(0);
    });
  });

  describe("Reward Calculation", function () {
    it("Should calculate correct rewards", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18); // 1M tokens
      const expectedReward = stakeAmount * BigInt(REWARD_PERCENTAGE) / 100n; // 150k tokens
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      const [stakedAmount, rewardAmount] = await stakingContract.calculateReward(user1.address);
      
      expect(stakedAmount).to.equal(stakeAmount);
      expect(rewardAmount).to.equal(expectedReward);
    });

    it("Should return zero for user with no stake", async function () {
      const { stakingContract, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const [stakedAmount, rewardAmount] = await stakingContract.calculateReward(user1.address);
      
      expect(stakedAmount).to.equal(0);
      expect(rewardAmount).to.equal(0);
    });
  });

  describe("Claim", function () {
    it("Should allow user to claim after staking period ends", async function () {
      const { stakingContract, stakingToken, owner, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      const expectedReward = stakeAmount * BigInt(REWARD_PERCENTAGE) / 100n;
      const totalExpected = stakeAmount + expectedReward;
      
      // User stakes
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      // Owner deposits rewards
      await stakingToken.connect(owner).approve(stakingContract.target, expectedReward);
      await stakingContract.connect(owner).depositRewards(expectedReward);
      
      // Fast forward to end of staking period
      await time.increase(STAKING_DURATION + 1);
      
      const initialBalance = await stakingToken.balanceOf(user1.address);
      
      await expect(stakingContract.connect(user1).claim())
        .to.emit(stakingContract, "Claimed")
        .withArgs(user1.address, stakeAmount, expectedReward);
      
      const finalBalance = await stakingToken.balanceOf(user1.address);
      expect(finalBalance - initialBalance).to.equal(totalExpected);
      
      // Check that stake is marked as claimed
      const userStake = await stakingContract.stakes(user1.address);
      expect(userStake.claimed).to.be.true;
    });

    it("Should not allow claim before staking period ends", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      await expect(stakingContract.connect(user1).claim())
        .to.be.revertedWith("Staking period not ended yet");
    });

    it("Should not allow claim for user with no stake", async function () {
      const { stakingContract, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      await time.increase(STAKING_DURATION + 1);
      
      await expect(stakingContract.connect(user1).claim())
        .to.be.revertedWith("No tokens staked");
    });

    it("Should not allow claiming twice", async function () {
      const { stakingContract, stakingToken, owner, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      const expectedReward = stakeAmount * BigInt(REWARD_PERCENTAGE) / 100n;
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      await stakingToken.connect(owner).approve(stakingContract.target, expectedReward);
      await stakingContract.connect(owner).depositRewards(expectedReward);
      
      await time.increase(STAKING_DURATION + 1);
      
      await stakingContract.connect(user1).claim();
      
      await expect(stakingContract.connect(user1).claim())
        .to.be.revertedWith("Rewards already claimed");
    });
  });

  describe("Owner Functions", function () {
    it("Should allow owner to deposit rewards", async function () {
      const { stakingContract, stakingToken, owner } = await loadFixture(deployStakingFixture);
      
      const rewardAmount = ethers.parseUnits("1000000", 18);
      
      await stakingToken.connect(owner).approve(stakingContract.target, rewardAmount);
      
      await expect(stakingContract.connect(owner).depositRewards(rewardAmount))
        .to.not.be.reverted;
    });

    it("Should not allow non-owner to deposit rewards", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployStakingFixture);
      
      const rewardAmount = ethers.parseUnits("1000000", 18);
      
      await stakingToken.connect(user1).approve(stakingContract.target, rewardAmount);
      
      await expect(stakingContract.connect(user1).depositRewards(rewardAmount))
        .to.be.revertedWithCustomError(stakingContract, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to withdraw unused tokens after staking ends", async function () {
      const { stakingContract, stakingToken, owner } = await loadFixture(deployAndStartStakingFixture);
      
      // Deposit some tokens to contract
      const depositAmount = ethers.parseUnits("1000000", 18);
      await stakingToken.connect(owner).approve(stakingContract.target, depositAmount);
      await stakingContract.connect(owner).depositRewards(depositAmount);
      
      // Fast forward to end
      await time.increase(STAKING_DURATION + 1);
      
      const withdrawAmount = ethers.parseUnits("500000", 18);
      const initialBalance = await stakingToken.balanceOf(owner.address);
      
      await stakingContract.connect(owner).withdrawUnusedTokens(withdrawAmount);
      
      const finalBalance = await stakingToken.balanceOf(owner.address);
      expect(finalBalance - initialBalance).to.equal(withdrawAmount);
    });

    it("Should not allow withdrawing unused tokens before staking ends", async function () {
      const { stakingContract, owner } = await loadFixture(deployAndStartStakingFixture);
      
      const withdrawAmount = ethers.parseUnits("500000", 18);
      
      await expect(stakingContract.connect(owner).withdrawUnusedTokens(withdrawAmount))
        .to.be.revertedWith("Staking period not ended yet");
    });
  });

  describe("View Functions", function () {
    it("Should return correct time info", async function () {
      const { stakingContract } = await loadFixture(deployAndStartStakingFixture);
      
      const [startTime, endTime, depositWindowEnd, currentTime] = await stakingContract.getTimeInfo();
      
      expect(startTime).to.be.greaterThan(0);
      expect(endTime).to.equal(startTime + BigInt(STAKING_DURATION));
      expect(depositWindowEnd).to.equal(startTime + BigInt(DEPOSIT_WINDOW));
      expect(currentTime).to.be.greaterThan(0);
    });

    it("Should return correct user stake info", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      const expectedReward = stakeAmount * BigInt(REWARD_PERCENTAGE) / 100n;
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      const [stakedAmount, claimed, potentialReward] = await stakingContract.getUserStakeInfo(user1.address);
      
      expect(stakedAmount).to.equal(stakeAmount);
      expect(claimed).to.be.false;
      expect(potentialReward).to.equal(expectedReward);
    });

    it("Should return correct staking status", async function () {
      const { stakingContract } = await loadFixture(deployAndStartStakingFixture);
      
      expect(await stakingContract.isStakingEnded()).to.be.false;
      
      await time.increase(STAKING_DURATION + 1);
      
      expect(await stakingContract.isStakingEnded()).to.be.true;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle staking exact maximum amount", async function () {
      const { stakingContract, stakingToken, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      await stakingToken.connect(user1).approve(stakingContract.target, MAX_TOTAL_STAKE);
      
      await expect(stakingContract.connect(user1).stake(MAX_TOTAL_STAKE))
        .to.not.be.reverted;
      
      expect(await stakingContract.totalStaked()).to.equal(MAX_TOTAL_STAKE);
      expect(await stakingContract.isCapReached()).to.be.true;
    });

    it("Should handle claiming at exact end time", async function () {
      const { stakingContract, stakingToken, owner, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const stakeAmount = ethers.parseUnits("1000000", 18);
      const expectedReward = stakeAmount * BigInt(REWARD_PERCENTAGE) / 100n;
      
      await stakingToken.connect(user1).approve(stakingContract.target, stakeAmount);
      await stakingContract.connect(user1).stake(stakeAmount);
      
      await stakingToken.connect(owner).approve(stakingContract.target, expectedReward);
      await stakingContract.connect(owner).depositRewards(expectedReward);
      
      // Fast forward to exactly the end time
      await time.increase(STAKING_DURATION);
      
      await expect(stakingContract.connect(user1).claim())
        .to.not.be.reverted;
    });

    it("Should handle zero reward calculation", async function () {
      const { stakingContract, user1 } = await loadFixture(deployAndStartStakingFixture);
      
      const [stakedAmount, rewardAmount] = await stakingContract.calculateReward(user1.address);
      
      expect(stakedAmount).to.equal(0);
      expect(rewardAmount).to.equal(0);
    });
  });
});
