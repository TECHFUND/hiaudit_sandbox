// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IERC20 {
    function balanceOf(address _owner) external view returns (uint256 balance);
    function transfer(address _to, uint256 _value) external returns (bool);
    function transferFrom(address _from, address _to, uint256 _value) external returns (bool);
    function allowance(address _owner, address _spender) external view returns (uint256);
    function mint(address _to, uint256 _value) external returns (bool);
    function burn(uint256 _value) external returns (bool);
}

contract EmethCore {

    mapping(address => bool) public owners;
    mapping(address => bool) public verifiers;
    address public masterVerifier;
    address private challengeSigner;

    // Constants
    bytes32 constant VERIFIER_FEE_RATE = keccak256('VERIFIER_FEE_RATE');
    bytes32 constant TIMEOUT_PENALTY_RATE = keccak256('TIMEOUT_PENALTY_RATE');
    bytes32 constant DECLINE_PENALTY_RATE = keccak256('DECLINE_PENALTY_RATE');
    bytes32 constant FAILED_PENALTY_RATE = keccak256('FAILED_PENALTY_RATE');
    bytes32 constant DEPOSIT_RATE = keccak256('DEPOSIT_RATE');
    bytes32 constant SLOT_REWARD_CAP_RATE = keccak256('SLOT_REWARD_CAP_RATE');
    bytes32 constant MAX_SLOT_FUEL_PER_NODE = keccak256('MAX_SLOT_FUEL_PER_NODE');
    bytes32 constant CHALLENGE_SIGNER = keccak256('CHALLENGE_SIGNER');
    uint256 constant REQUESTED = 1;
    uint256 constant PROCESSING = 2;
    uint256 constant SUBMITTED = 3;
    uint256 constant VERIFIED = 4;
    uint256 constant CANCELED = 5;
    uint256 constant TIMEOUT = 6;
    uint256 constant FAILED = 7;
    uint256 constant DECLINED = 8;

    // Paramters
    mapping(bytes32 => uint256) private PARAMETERS;

    // EMT (Constants)
    IERC20 immutable public emtToken;
    uint256 immutable public startSlot;
    uint256 constant BASE_SLOT_REWARD = 12000 * 24 * 1e18; // 12,000 EMT x 24
    uint256 constant SLOT_INTERVAL = 24 hours;
    uint256 constant DECREMENT_PERIOD = 365 days;
    uint256 constant DECREMENT_RATE = 600 * 24 * 1e18; // 600 EMT x 24

    // Slots
    mapping (uint256 => uint256) private slotTotalFuel; // (slotNumber => totalFuel)
    mapping (uint256 => mapping(address => uint256)) public slotFuel; // (slotNumber => (nodeAddress => reward))
    mapping (uint256 => mapping(address => uint256)) public slotBalances; // (slotNumber => (nodeAddress => reward))
    mapping (address => uint256) public lastJobAssigned;
    mapping (address => uint256) public deposits;

    // Jobs
    mapping(bytes16 => Job) public jobs;
    mapping(bytes16 => JobDetail) public jobDetails;
    mapping(bytes16 => JobAssign) public jobAssigns;
    mapping(bytes16 => bytes16[]) public jobChildren;

    // Programs
    mapping(uint256 => Program) public programs;

    // Events
    event Status(bytes16 indexed jobId, address sender, uint256 status);

    // Structs
    struct Job {
        bool exist;
        bytes16 jobId;
        bytes16 parentJob;
        address owner;
        uint256 deadline;
        uint256 fuelLimit;
        uint256 fuelPrice;
        uint256 status; //0: requested, 1: assigned, 2: processing, 3: completed, 4: canceled
        uint256 requestedAt;
    }

    struct JobDetail {
        uint256 programId;
        uint256 numParallel;
        uint256 numEpoch;
        string param;
        string dataset;
        string result;
    }

    struct JobAssign {
        address node;
        uint256 deposit;
        uint256 fuelUsed;
        uint256 startedAt;
        uint256 submittedAt;
        uint256 verifiedAt;
        uint256 slot;
    }

    struct Program {
        uint256 programId;
        string programName;
        uint256 mode; // 0: normal, 1: direct
        uint256 minFuelPrice;
        uint256 cooldownPeriod;
        uint256 defaultFuelLimit;
        uint256 defaultFuelPrice;
        uint256 minTarget;
    }

    // Modifiers
    modifier onlyOwner() {
        require(owners[msg.sender], "Ownable: insufficient privilege");
        _;
    }

    modifier onlyVerifier() {
        require(verifiers[msg.sender], "Verifiable: msg.sender does not have the Verifier role");
        _;
    }

    function addOwner(address _addr) external onlyOwner {
        owners[_addr] = true;
    }

    function removeOwner(address _addr) external onlyOwner {
        owners[_addr] = false;
    }

    function addVerifier(address _addr) external onlyOwner {
        verifiers[_addr] = true;
    }

    function removeVerifier(address _addr) external onlyOwner {
        verifiers[_addr] = false;
    }

    function setMasterVerifier(address _addr) external onlyOwner {
        masterVerifier = _addr;
    }

    function setChallengeSigner(address _addr) external onlyOwner {
        challengeSigner = _addr;
    }

    // Constructor
    constructor(address _tokenAddress) {
        owners[msg.sender] = true;
        verifiers[msg.sender] = true;
        masterVerifier = msg.sender;
        emtToken= IERC20(_tokenAddress);
        startSlot = block.timestamp / SLOT_INTERVAL;

        // Parameters
        PARAMETERS[keccak256('TIMEOUT_PENALTY_RATE')] = 250; // 25% of fee
        PARAMETERS[keccak256('DECLINE_PENALTY_RATE')] = 250; // 25% of fee
        PARAMETERS[keccak256('FAILED_PENALTY_RATE')] = 250; // 25% of fee
        PARAMETERS[keccak256('DEPOSIT_RATE')] = 0; // Initially 0%, then 100% of fee
        PARAMETERS[keccak256('SLOT_REWARD_CAP_RATE')] = 50; // 5% of slot reward
        PARAMETERS[keccak256('VERIFIER_FEE_RATE')] = 0; // Initially 0%, then 5% of fee
        PARAMETERS[keccak256('MAX_SLOT_FUEL_PER_NODE')] = 10000000000;
    }

    // Functions for Requester
    function request(
        bytes16 _jobId,
        uint256 _programId,
        bytes16 _parentJob,
        uint256 _numParallel,
        uint256 _numEpoch,
        string calldata _dataset,
        string calldata _param,
        uint256 _fuelLimit,
        uint256 _fuelPrice,
        uint256 _deadline
    ) external returns (bool) {
        _request(_jobId, _programId, msg.sender, _parentJob, _numParallel, _numEpoch, _dataset, _param, _fuelLimit, _fuelPrice, _deadline);
        return true;
    }

    function cancel(bytes16 _jobId) external returns (bool) {
        Job storage job = jobs[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(job.status == REQUESTED, "Job is already being processed or canceled");
        require(jobs[_jobId].owner == msg.sender, "EmethCore: job is not requested by your node");

        job.status = CANCELED;

        uint256 feeLimit = job.fuelLimit * job.fuelPrice;
        uint256 verifierFee = feeLimit * PARAMETERS[VERIFIER_FEE_RATE] / 1000;
        uint256 feeTotal = feeLimit + verifierFee;
        if (feeTotal > 0) emtToken.transfer(msg.sender, feeTotal);

        emit Status(_jobId, msg.sender, CANCELED);
        return true;
    }

    // Functions for Node
    function process(bytes16 _jobId) external returns (bool) {
        Job storage job = jobs[_jobId];
        JobDetail memory jobDetail = jobDetails[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.status == REQUESTED, "EmethCore: the status is not REQUESTED");
        require(lastJobAssigned[msg.sender] + programs[jobDetail.programId].cooldownPeriod < block.timestamp, "EmethCore: need wait for cooldown");

        uint256 feeLimit = job.fuelLimit * job.fuelPrice;
        uint256 verifierFee = feeLimit * PARAMETERS[VERIFIER_FEE_RATE] / 1000;
        uint256 deposit = feeLimit * PARAMETERS[DEPOSIT_RATE] / 1000;
        require(deposits[msg.sender] >= deposit + verifierFee, "EmethCore: insufficient deposit");
        deposits[msg.sender] = deposits[msg.sender] - (deposit + verifierFee);

        job.status = PROCESSING;
        jobAssign.node = msg.sender;
        jobAssign.deposit = deposit + verifierFee;
        jobAssign.startedAt = block.timestamp;
        lastJobAssigned[jobAssign.node] = jobAssign.startedAt;

        emit Status(_jobId, msg.sender, PROCESSING);
        return true;
    }

    function decline(bytes16 _jobId) external returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(job.status == PROCESSING, "EmethCore: job is not being processed");
        require(jobAssigns[_jobId].node == msg.sender, "EmethCore: job is not assigned to your node");

        job.status = DECLINED;

        // Fee Refund
        uint256 feeLimit = job.fuelLimit * job.fuelPrice;
        uint256 verifierFee = feeLimit * PARAMETERS[VERIFIER_FEE_RATE] / 1000;
        uint256 feeTotal = feeLimit + verifierFee;
        if (feeTotal > 0) emtToken.transfer(job.owner, feeTotal);

        // Deposit Refund with Penalty
        uint256 penalty = feeLimit * PARAMETERS[DECLINE_PENALTY_RATE] / 1000;
        if(penalty < jobAssign.deposit) {
            deposits[msg.sender] = deposits[msg.sender] + (jobAssign.deposit - penalty);
        }
        emtToken.burn(penalty);

        emit Status(_jobId, msg.sender, DECLINED);
        return true;
    }

    function submit(bytes16 _jobId, string calldata _result, uint256 _fuelUsed) external returns (bool) {
        _submit(msg.sender, _jobId, 0, _result, _fuelUsed);
        return true;
    }

    function deligatedSubmit(address _node, bytes16 _jobId, uint256 _programId, string calldata _result, uint256 _fuelUsed) external returns (bool) {
        _submit(_node, _jobId, _programId, _result, _fuelUsed);
        return true;
    }

    function directSubmit(bytes16 _jobId, string calldata _result, uint256 _fuelUsed, uint256 _programId) external returns (bool) {
        _submit(msg.sender, _jobId, _programId, _result, _fuelUsed);
        return true;
    }

    function _submit(address _node, bytes16 _jobId, uint256 _programId, string calldata _result, uint256 _fuelUsed) internal returns (bool) {
        Job storage job = jobs[_jobId];
        JobDetail storage jobDetail = jobDetails[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        if (job.exist) {
            require(jobAssign.node == _node, "EmethCore: job is not assigned to your node");
            require(job.status == PROCESSING, "EmethCore: job is not being processed");
            require(job.fuelLimit >= _fuelUsed, "EmethCore: fuelUsed exceeds fuelLimit");

            job.status = SUBMITTED;
            jobDetail.result = _result;
            jobAssign.fuelUsed = _fuelUsed;
            jobAssign.submittedAt = block.timestamp;

            emit Status(_jobId, _node, SUBMITTED);
        } else {
            require(_programId > 0, "EmethCore: jobId is not exist");
            Program memory program = programs[_programId];
            if (program.minTarget > 0) {
                // Split _result into (challenge, nonce)
                string memory challengeStr = subString(_result, 0, 130);
                bytes memory challenge = str2Bytes(challengeStr);

                // Verify recover(_jobId, challenge) == requestSigner
                {
                bytes32 jobId32 = bytes32(_jobId) >> 128;
                address signer = recover(jobId32, challenge);
                require(signer == challengeSigner, "EmethCore: invalid challenge");
                }

                // Verify sha256(challenge + nonce) < difficulty
                {
                bytes memory resultBytes = str2Bytes(_result);
                bytes32 hash = sha256(resultBytes);
                require(uint256(hash) <= program.minTarget, "EmethCore: invalid nonce");
                }

                // Requirement
                require(lastJobAssigned[_node] + program.cooldownPeriod < block.timestamp, "EmethCore: need wait for cooldown");

                // Request
                uint256 fuelLimit = program.defaultFuelLimit;
                uint256 fuelPrice = program.defaultFuelPrice;
                _request(_jobId, _programId, challengeSigner, bytes16(0), 1, 1, challengeStr, "", fuelLimit, fuelPrice, block.timestamp);

                // Process
                {
                jobAssign.node = _node;
                jobAssign.startedAt = block.timestamp;
                lastJobAssigned[_node] = block.timestamp;
                emit Status(_jobId, _node, PROCESSING);
                }

                // Submit
                require(_fuelUsed <= fuelLimit, "EmethCore: fuelUsed exceeds fuelLimit");
                jobDetail.result = _result;
                jobAssign.fuelUsed = _fuelUsed;
                jobAssign.submittedAt = block.timestamp;
                emit Status(_jobId, _node, SUBMITTED);

                // Verify
                job.status = VERIFIED;
                jobAssign.verifiedAt = block.timestamp;
                jobAssign.slot = _putSlotReward(_jobId);
                emtToken.mint(_node, _fuelUsed * fuelPrice);
                emit Status(_jobId, masterVerifier, VERIFIED);
            } else {
                // Requirement
                require(lastJobAssigned[_node] + program.cooldownPeriod < block.timestamp, "EmethCore: need wait for cooldown");

                // Request
                uint256 fuelLimit = program.defaultFuelLimit;
                uint256 fuelPrice = program.defaultFuelPrice;
                _request(_jobId, _programId, msg.sender, bytes16(0), 1, 1, _result, "", _fuelUsed, fuelPrice, block.timestamp);

                // Process
                {
                jobAssign.node = _node;
                jobAssign.startedAt = block.timestamp;
                lastJobAssigned[_node] = block.timestamp;
                emit Status(_jobId, _node, PROCESSING);
                }

                // Submit
                require(_fuelUsed <= fuelLimit, "EmethCore: fuelUsed exceeds fuelLimit");
                jobDetail.result = _result;
                jobAssign.fuelUsed = _fuelUsed;
                jobAssign.submittedAt = block.timestamp;
                emit Status(_jobId, _node, SUBMITTED);

            }
        }
        return true;
    }

    function withdrawSlotReward(address _node, uint256 _slot) external returns (bool) {
        require(_slot < block.timestamp / SLOT_INTERVAL, "The slot has not been closed");
        require(slotBalances[_slot][_node] > 0, "The slot reward is empty");

        uint256 reward = _slotReward(_slot) * slotBalances[_slot][_node] / slotTotalFuel[_slot];
        uint256 maxReward = deposits[_node] * 1000 / PARAMETERS['SLOT_REWARD_CAP_RATE'];
        if (reward > maxReward) reward = maxReward;
        emtToken.mint(_node, reward);

        slotBalances[_slot][_node] = 0;

        return true;
    }

    function withdrawSlotRewardInRange(address _node, uint256 _startSlot, uint256 _endSlot) external returns (bool) {
        require(_startSlot <= _endSlot, "endSlot should be later than startSlot");
        require(_endSlot < block.timestamp / SLOT_INTERVAL, "The slot has not been closed");

        uint256 totalReward = 0;
        for(uint256 slot = _startSlot; slot <= _endSlot; slot++) {
            if(slotTotalFuel[slot] > 0) {
                uint256 reward = _slotReward(slot) * slotBalances[slot][_node] / slotTotalFuel[slot];
                uint256 maxReward = deposits[_node] * 1000 / PARAMETERS['SLOT_REWARD_CAP_RATE'];
                if (reward > maxReward) reward = maxReward;
                totalReward += reward;
                slotBalances[slot][_node] = 0;
            }
        }

        emtToken.mint(_node, totalReward);

        return true;
    }

    // Functions for Verifier
    function verify(bytes16 _jobId) external onlyVerifier returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(job.status == SUBMITTED, "EmethCore: job result is not submitted");

        job.status = VERIFIED;

        // Put in Reward Slot
        jobAssign.slot = _putSlotReward(_jobId);

        // Return Deposit
        emtToken.transfer(jobAssign.node, jobAssign.deposit);

        // Distribute Fee
        uint256 feeLimit = job.fuelLimit * job.fuelPrice;
        uint256 verifierFee = feeLimit * PARAMETERS[VERIFIER_FEE_RATE] / 1000;
        uint256 feeUsed = jobAssign.fuelUsed * job.fuelPrice;
        uint256 refund = feeLimit - feeUsed;
        if (feeUsed > 0) emtToken.transfer(jobAssign.node, feeUsed);
        if (refund > 0) emtToken.transfer(job.owner, refund);

        // Verifier Fee
        if (verifierFee > 0) emtToken.transfer(masterVerifier, verifierFee);

        emit Status(_jobId, msg.sender, VERIFIED);
        return true;
    }

    function timeout(bytes16 _jobId) external onlyVerifier returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(job.status == PROCESSING || job.status == REQUESTED, "EmethCore: job is not in requested or processing status");
        require(job.deadline <= block.timestamp, "EmethCore: still earlier than the deadline");

        job.status = TIMEOUT;

        // Tx Fee Refund
        uint256 feeLimit = jobAssign.fuelUsed * job.fuelPrice;
        uint256 verifierFee = feeLimit * PARAMETERS[VERIFIER_FEE_RATE] / 1000;
        uint256 feeTotal = feeLimit + verifierFee;
        if (feeTotal > 0) emtToken.transfer(job.owner, feeTotal);

        // Deposit Refund with Penalty
        if(job.status == PROCESSING) {
            uint256 penalty = feeLimit * PARAMETERS[TIMEOUT_PENALTY_RATE] / 1000;
            if(penalty < jobAssign.deposit) {
                emtToken.transfer(jobAssign.node, jobAssign.deposit - penalty);
            }
            emtToken.burn(penalty);
        }

        emit Status(_jobId, msg.sender, TIMEOUT);
        return true;
    }

    function rejectResult(bytes16 _jobId) external onlyVerifier returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(jobs[_jobId].status == SUBMITTED, "EmethCore: job result is not submitted");

        job.status = FAILED;

        // Tx Fee Refund
        uint256 feeLimit = jobAssign.fuelUsed * job.fuelPrice;
        uint256 verifierFee = feeLimit * PARAMETERS[VERIFIER_FEE_RATE] / 1000;
        uint256 feeTotal = feeLimit + verifierFee;
        if (feeTotal > 0) emtToken.transfer(job.owner, feeTotal);

        // Deposit Refund with Penalty
        uint256 penalty = feeLimit * PARAMETERS[FAILED_PENALTY_RATE] / 1000;
        if(penalty < jobAssign.deposit) {
            deposits[jobAssign.node] += (jobAssign.deposit - verifierFee - penalty);
        }
        emtToken.burn(penalty);

        // Verifier Fee
        if (verifierFee > 0) emtToken.transfer(masterVerifier, verifierFee);

        emit Status(_jobId, msg.sender, FAILED);
        return true;
    }

    // Admin
    function setProgram(
        uint256 _programId,
        string memory _programName,
        uint256 _mode,
        uint256 _minFuelPrice,
        uint256 _cooldownPeriod,
        uint256 _defaultFeeLimit,
        uint256 _defaultFeePrice,
        uint256 _minTarget) external onlyOwner returns (bool) {
        programs[_programId] = Program(_programId, _programName, _mode, _minFuelPrice, _cooldownPeriod, _defaultFeeLimit, _defaultFeePrice, _minTarget);
        return true;
    }

    function setParameter(bytes32 _parameter, uint256 _value) external onlyOwner returns (bool) {
        PARAMETERS[_parameter] = _value;
        return true;
    }

    function setMinTarget(uint256 _programId, uint256 _target) external onlyOwner returns (bool) {
        programs[_programId].minTarget = _target;
        return true;
    }

    function setMinTargetByDifficulty(uint256 _programId, uint256 _difficulty) external onlyOwner returns (bool) {
        programs[_programId].minTarget = (2**256 - 1) / _difficulty;
        return true;
    }

    // Utilities
    function getParameter(string memory _name) external view returns (uint256) {
        return PARAMETERS[keccak256(bytes(_name))];
    }

    function currentSlotReward() external view returns (uint256) {
        return _slotReward(currentSlot());
    }

    function currentSlot() public view returns (uint256) {
        return block.timestamp / SLOT_INTERVAL;
    }

    function slots(uint256 _slot) external view returns (uint256 _totalFuel, uint256 _totalReward) {
        return (slotTotalFuel[_slot], _slotReward(_slot));
    }

    function slotRewards(uint256 _slot, address _node) external view returns (uint256 _fuel, uint256 _balance, uint256 _reward) {
        uint256 reward = _slotReward(_slot) * slotBalances[_slot][_node] / slotTotalFuel[_slot];
        return (slotFuel[_slot][_node], slotBalances[_slot][_node], reward);
    }

    // Private
    function _putSlotReward(bytes16 _jobId) private returns (uint256) {
        JobAssign storage jobAssign = jobAssigns[_jobId];
        address node = jobAssigns[_jobId].node;
        uint256 slot = block.timestamp / SLOT_INTERVAL;

        uint256 fuelCounted = jobAssign.fuelUsed;
        if(slotFuel[slot][node] + jobAssign.fuelUsed >= PARAMETERS[MAX_SLOT_FUEL_PER_NODE]) {
            fuelCounted = PARAMETERS[MAX_SLOT_FUEL_PER_NODE] - slotFuel[slot][node];
        }

        slotTotalFuel[slot] = slotTotalFuel[slot] + fuelCounted;
        slotFuel[slot][node] = slotFuel[slot][node] + fuelCounted;
        slotBalances[slot][node] = slotBalances[slot][node] + fuelCounted;

        return slot;
    }

    function _slotReward(uint256 _slot) private view returns (uint256) {
        uint256 reward = 0;
        uint256 halvingAmount = (_slot - startSlot) / (DECREMENT_PERIOD / SLOT_INTERVAL) * DECREMENT_RATE;
        if(BASE_SLOT_REWARD > halvingAmount) {
            reward = BASE_SLOT_REWARD - halvingAmount;
        }
        return reward;
    }

    function _request(
        bytes16 _jobId,
        uint256 _programId,
        address _jobOwner,
        bytes16 _parentJob,
        uint256 _numParallel,
        uint256 _numEpoch,
        string memory _dataset,
        string memory _param,
        uint256 _fuelLimit,
        uint256 _fuelPrice,
        uint256 _deadline
    ) private returns (bool) {
        Program memory program = programs[_programId];
        require(!jobs[_jobId].exist, "EmethCore: Job ID already exists");
        require(program.programId > 0,"EmethCore: no program exists");

        if (program.mode == 1) {
            _fuelLimit = program.defaultFuelLimit;
            _fuelPrice = program.defaultFuelPrice;
        }

        require(_fuelPrice >= programs[_programId].minFuelPrice, "EmethCore: fuelPrice too low");

        {
          uint256 feeLimit = _fuelLimit * _fuelPrice;
          uint256 feeTotal = feeLimit + (feeLimit * PARAMETERS[VERIFIER_FEE_RATE] / 1000);
          if (program.mode != 1) {
            require(emtToken.balanceOf(msg.sender) >= feeTotal, "EmethCore: insufficient balance for feeTotal");
            require(emtToken.allowance(msg.sender, address(this)) >= feeTotal, "EmethCore: insufficient allowance for feeTotal");
            if (feeTotal > 0) emtToken.transferFrom(msg.sender, address(this), feeTotal);
          }
        }

        jobs[_jobId] = Job({
            exist: true,
            jobId: _jobId,
            parentJob: _parentJob,
            owner: _jobOwner,
            deadline: _deadline,
            fuelLimit: _fuelLimit,
            fuelPrice: _fuelPrice,
            status: REQUESTED,
            requestedAt: block.timestamp
        });

        jobDetails[_jobId] = JobDetail({
            programId: _programId,
            numParallel: _numParallel,
            numEpoch: _numEpoch,
            param: _param,
            dataset: _dataset,
            result: ""
        });

        jobAssigns[_jobId] = JobAssign({
            node: address(0),
            deposit: 0,
            fuelUsed: 0,
            startedAt: 0,
            submittedAt: 0,
            verifiedAt: 0,
            slot: 0
        });

        //jobIndexes.push(_jobId);
        if(_parentJob != bytes16(0)) jobChildren[_parentJob].push(_jobId);

        emit Status(_jobId, _jobOwner, REQUESTED);
        return true;
    }

    // Library
    function char2Int(uint8 c) internal pure returns (uint8) {
        if (bytes1(c) >= bytes1('0') && bytes1(c) <= bytes1('9')) return c - uint8(bytes1('0'));
        if (bytes1(c) >= bytes1('a') && bytes1(c) <= bytes1('f')) return 10 + c - uint8(bytes1('a'));
        if (bytes1(c) >= bytes1('A') && bytes1(c) <= bytes1('F')) return 10 + c - uint8(bytes1('A'));
        revert("Failed to convert str to bytes");
    }

    function str2Bytes(string memory s) internal pure returns (bytes memory) {
        bytes memory ss = bytes(s);
        require(ss.length % 2 == 0, "Length must be even");
        bytes memory r = new bytes(ss.length / 2);
        for (uint256 i = 0; i < ss.length / 2; ++i) {
            r[i] = bytes1(char2Int(uint8(ss[2*i])) * 16 + char2Int(uint8(ss[2*i+1])));
        }
        return r;
    }

    function subString(string memory str, uint startIndex, uint endIndex) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(endIndex - startIndex);
        for(uint i = startIndex; i < endIndex; i++) {
            result[i - startIndex] = strBytes[i];
        }
        return string(result);
    }

    function recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        //Check the signature length
        if (sig.length != 65) {
        return (address(0));
        }

        // Divide the signature in r, s and v variables
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        // Version of signature should be 27 or 28, but 0 and 1 are also possible versions
        if (v < 27) {
            v += 27;
        }

        // If the version is correct return the signer address
        if (v != 27 && v != 28) {
            return (address(0));
        } else {
            bytes memory prefix = "\x19Ethereum Signed Message:\n32";
            bytes32 prefixedHashMessage = keccak256(abi.encodePacked(prefix, hash));
            return ecrecover(prefixedHashMessage, v, r, s);
        }
    }
}
