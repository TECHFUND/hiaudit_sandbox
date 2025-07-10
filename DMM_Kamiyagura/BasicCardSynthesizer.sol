// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ICard} from "./interfaces/ICard.sol";
import {IBasicCard} from "./interfaces/IBasicCard.sol";
import {IFtSender} from "./interfaces/IFtSender.sol";
import {CustomizedAccessControl} from "./utils/CustomizedAccessControl.sol";

/**
 * @title BasicCardSynthesizer
 * @dev A contract that handles the synthesis of basic cards into new cards.
 */
contract BasicCardSynthesizer is CustomizedAccessControl {
    /// @dev The contract instance for basic cards.
    IBasicCard private basicCard;

    /// @dev The contract instance for the synthesized cards.
    ICard private card;

    IFtSender private ftSender;

    /**
     * @dev Emitted when a new card is synthesized from basic cards.
     * @param _requestId The ID of the synthesis request.
     * @param _to The address that will receive the new card.
     * @param _newCardTokenId The token ID of the new card.
     * @param _basicCardTokenIds The token IDs of the basic cards used in the synthesis.
     */
    event BasicCardSynthesize(
        string _requestId,
        address indexed _to,
        uint256 _newCardTokenId,
        uint256[] _basicCardTokenIds
    );

    event BasicCardSynthesizeWithFee(
        string _requestId,
        address indexed _userWalletAddresss,
        address indexed _managerAddress,
        uint256 _feeAmount,
        uint256 _newCardTokenId,
        uint256[] _basicCardTokenIds
    );

    /**
     * @dev Initializes the contract with the specified basic card and card contract addresses.
     * @param _basicCard The address of the basic card contract.
     * @param _card The address of the card contract.
     */
    function initialize(
        address _basicCard,
        address _card,
        address _ftSender
    ) public initializer {
        basicCard = IBasicCard(_basicCard);
        card = ICard(_card);
        ftSender = IFtSender(_ftSender);
        __CustomizedAccessControl_init();
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Sets the address of the basic card contract.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _basicCard The address of the new basic card contract.
     */
    function setBasicCardContract(
        address _basicCard
    ) public onlyRole(OPERATOR_ROLE) {
        basicCard = IBasicCard(_basicCard);
    }

    /**
     * @notice Sets the address of the card contract.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _card The address of the new card contract.
     */
    function setCardContract(address _card) public onlyRole(OPERATOR_ROLE) {
        card = ICard(_card);
    }

    function setFtsenderContract(
        address _ftSender
    ) public onlyRole(OPERATOR_ROLE) {
        ftSender = IFtSender(_ftSender);
    }

    /**
     * @notice Synthesizes a new card from basic cards.
     * @dev Burns the specified basic cards and mints a new card with the given ID.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the synthesis request.
     * @param to The address that will receive the new card.
     * @param newCardTokenId The token ID of the new card.
     * @param basicCardTokenIds The token IDs of the basic cards to be used in the synthesis.
     * @param cardId The ID of the card to be associated with the new card token.
     */
    function synthesize(
        string calldata requestId,
        address to,
        uint256 newCardTokenId,
        uint256[] calldata basicCardTokenIds,
        string calldata cardId
    ) public onlyRole(OPERATOR_ROLE) {
        for (uint256 i = 0; i < basicCardTokenIds.length; ) {
            require(
                basicCard.ownerOf(basicCardTokenIds[i]) == to,
                "The address does not own the specified basic card"
            );
            basicCard.burn(basicCardTokenIds[i]);
            unchecked {
                i++;
            }
        }
        card.mint(to, newCardTokenId, cardId);

        emit BasicCardSynthesize(
            requestId,
            to,
            newCardTokenId,
            basicCardTokenIds
        );
    }

    /**
     * @notice Synthesizes a new card from base cards.
     * @dev Burns the specified base cards and mints a new card with the given ID.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the synthesis request.
     * @param userWalletAddress The address that will receive the new card.
     * @param newCardTokenId The token ID of the new card.
     * @param basicCardTokenIds The token IDs of the base cards to be used in the synthesis.
     * @param cardId The ID of the card to be associated with the new card token.
     */
    function synthesizeWithFee(
        string calldata requestId,
        address userWalletAddress,
        address managerAddress,
        uint256 feeAmount,
        uint256 newCardTokenId,
        uint256[] calldata basicCardTokenIds,
        string calldata cardId
    ) public onlyRole(OPERATOR_ROLE) {
        ftSender.transfer(
            userWalletAddress,
            managerAddress,
            feeAmount,
            keccak256(abi.encode(requestId))
        );
        for (uint256 i = 0; i < basicCardTokenIds.length; ) {
            require(
                basicCard.ownerOf(basicCardTokenIds[i]) == userWalletAddress,
                "The address does not own the specified basic card"
            );
            basicCard.burn(basicCardTokenIds[i]);
            unchecked {
                i++;
            }
        }
        card.mint(userWalletAddress, newCardTokenId, cardId);

        emit BasicCardSynthesizeWithFee(
            requestId,
            userWalletAddress,
            managerAddress,
            feeAmount,
            newCardTokenId,
            basicCardTokenIds
        );
    }
}
