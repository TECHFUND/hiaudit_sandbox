// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IFtSender} from "./interfaces/IFtSender.sol";
import {TransactedEventHash} from "./utils/TransactedEventHash.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FtSender
 * @dev A contract that handles the sending and management of ERC20 tokens with event hash tracking.
 */
contract FtSender is IFtSender, TransactedEventHash {
    using SafeERC20 for IERC20;

    /// @dev The ERC20 token contract used for transactions.
    IERC20 private erc20;

    /**
     * @dev Initializes the contract with the specified ERC20 token contract address.
     * @param _ft The address of the ERC20 token contract.
     */
    function initialize(address _ft) public initializer {
        __TransactedEventHash_init();
        erc20 = IERC20(_ft);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Sets the address of the ERC20 token contract.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _ft The address of the new ERC20 token contract.
     */
    function setFtContract(address _ft) public onlyRole(OPERATOR_ROLE) {
        erc20 = IERC20(_ft);
    }

    /**
     * @notice Handles tipping transactions, transferring tokens between specified addresses.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _requestId The ID of the request.
     * @param _payer The address of the payer.
     * @param _receiver The address of the receiver.
     * @param _depositAddress The address to deposit tokens to.
     * @param _withdrawalAddress The address to withdraw tokens from.
     * @param _depositAmount The amount of tokens to deposit.
     * @param _withdrawalAmount The amount of tokens to withdraw.
     */
    function tip(
        string calldata _requestId,
        address _payer,
        address _receiver,
        address _depositAddress,
        address _withdrawalAddress,
        uint256 _depositAmount,
        uint256 _withdrawalAmount
    ) public onlyRole(OPERATOR_ROLE) {
        _transfer(
            _payer,
            _depositAddress,
            _depositAmount,
            keccak256(abi.encode(_requestId, _depositAddress))
        );
        _transfer(
            _withdrawalAddress,
            _receiver,
            _withdrawalAmount,
            keccak256(abi.encode(_requestId, _withdrawalAddress))
        );

        emit Tip(
            _requestId,
            _payer,
            _receiver,
            _depositAddress,
            _withdrawalAddress,
            _depositAmount,
            _withdrawalAmount
        );
    }

    /**
     * @notice Handles the payment in FT, transferring tokens between specified addresses.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _requestId The ID of the request.
     * @param _from The address sending the tokens.
     * @param _to The address receiving the tokens.
     * @param _amount The amount of tokens to transfer.
     */
    function pay(
        string calldata _requestId,
        address _from,
        address _to,
        uint256 _amount
    ) public onlyRole(OPERATOR_ROLE) {
        _transfer(_from, _to, _amount, keccak256(abi.encode(_requestId)));

        emit FtPayment(_requestId, _from, _to, _amount);
    }

    /**
     * @notice Distributes rewards by transferring tokens to multiple addresses.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _requestId The ID of the request.
     * @param _from The address sending the tokens.
     * @param _units An array of TransferUint structs containing the recipient addresses and amounts.
     */
    function reward(
        string calldata _requestId,
        address _from,
        TransferUint[] calldata _units
    ) external onlyRole(OPERATOR_ROLE) {
        for (uint256 i = 0; i < _units.length; ) {
            _transfer(
                _from,
                _units[i].to,
                _units[i].amount,
                keccak256(abi.encode(_requestId, i))
            );
            unchecked {
                i++;
            }
        }
        emit FtReward(_requestId, _from);
    }

    /**
     * @notice Transfers tokens from one address to another with an event hash for tracking.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _from The address sending the tokens.
     * @param _to The address receiving the tokens.
     * @param _amount The amount of tokens to transfer.
     * @param _eventHash The event hash used for tracking the transaction.
     */
    function transfer(
        address _from,
        address _to,
        uint256 _amount,
        bytes32 _eventHash
    ) external onlyRole(OPERATOR_ROLE) {
        _transfer(_from, _to, _amount, _eventHash);
    }

    /**
     * @dev Internal function to handle token transfers and track the transaction using an event hash.
     * @param _from The address sending the tokens.
     * @param _to The address receiving the tokens.
     * @param _amount The amount of tokens to transfer.
     * @param _eventHash The event hash used for tracking the transaction.
     */
    function _transfer(
        address _from,
        address _to,
        uint256 _amount,
        bytes32 _eventHash
    ) internal {
        if (isTransactedEventHash(_eventHash)) return;

        if (_from == address(this)) {
            erc20.safeTransfer(_to, _amount);
        } else {
            erc20.safeTransferFrom(_from, _to, _amount);
        }

        setTransactedEventHash(_eventHash, true);
    }

    /**
     * @notice Checks if a specific event hash has already been processed.
     * @param _eventHash The event hash to check.
     * @return `true` if the event hash has already been processed, `false` otherwise.
     */
    function isTransactedEventHash(
        bytes32 _eventHash
    ) public view override(IFtSender, TransactedEventHash) returns (bool) {
        return super.isTransactedEventHash(_eventHash);
    }

    /**
     * @notice Marks an event hash as processed or unprocessed.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _eventHash The event hash to mark.
     * @param _desired The desired status of the event hash (`true` for processed, `false` for unprocessed).
     */
    function setTransactedEventHash(
        bytes32 _eventHash,
        bool _desired
    ) public override(IFtSender, TransactedEventHash) onlyRole(OPERATOR_ROLE) {
        super.setTransactedEventHash(_eventHash, _desired);
    }
}
