// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {INftSender} from "./interfaces/INftSender.sol";
import {IFtSender} from "./interfaces/IFtSender.sol";
import {ICard} from "./interfaces/ICard.sol";
import {CustomizedAccessControl} from "./utils/CustomizedAccessControl.sol";

/**
 * @title NftSender
 * @dev A contract that handles the distribution of NFTs and interactions with a fungible token (FT) sender.
 */
contract NftSender is INftSender, CustomizedAccessControl {
    /// @dev The contract instance for the card interface.
    ICard private card;

    /// @dev The contract instance for the fungible token sender interface.
    IFtSender private ftSender;

    /**
     * @dev Initializes the contract with the specified card and FT sender contract addresses.
     * @param _card The address of the card contract.
     * @param _ftSender The address of the FT sender contract.
     */
    function initialize(address _card, address _ftSender) public initializer {
        card = ICard(_card);
        ftSender = IFtSender(_ftSender);
        __CustomizedAccessControl_init();
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Sets the address of the card contract.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _card The address of the new card contract.
     */
    function setCardContract(address _card) public onlyRole(OPERATOR_ROLE) {
        card = ICard(_card);
    }

    /**
     * @notice Sets the address of the FT sender contract.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _ftSender The address of the new FT sender contract.
     */
    function setFtSenderContract(
        address _ftSender
    ) public onlyRole(OPERATOR_ROLE) {
        ftSender = IFtSender(_ftSender);
    }

    /**
     * @notice Rewards users with NFTs by minting and distributing them.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param _requestId The ID of the request.
     * @param _units An array of TransferUint structs containing the recipient addresses, token IDs, and card IDs.
     */
    function cardReward(
        string calldata _requestId,
        TransferUint[] calldata _units
    ) external onlyRole(OPERATOR_ROLE) {
        for (uint256 i = 0; i < _units.length; ) {
            card.mint(_units[i].to, _units[i].tokenId, _units[i].cardId);
            unchecked {
                i++;
            }
        }
        emit NftReward(_requestId);
    }

    /**
     * @notice Opens a pack and mints the corresponding NFTs to the specified address.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the request.
     * @param to The address to receive the minted NFTs.
     * @param issuedPackId The ID of the issued pack.
     * @param cards An array of TokenIdWithCardId structs containing the token IDs and card IDs to mint.
     */
    function packOpen(
        string calldata requestId,
        address to,
        uint256 issuedPackId,
        ICard.TokenIdWithCardId[] calldata cards
    ) external onlyRole(OPERATOR_ROLE) {
        card.bulkMint(to, cards);

        emit PackOpen(requestId, issuedPackId);
    }

    /**
     * @notice Handles the purchase of a pack, transferring the required FT amount and minting the corresponding NFTs.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the request.
     * @param manager The address of the manager receiving the FT.
     * @param userWalletAddress The address of the user purchasing the pack.
     * @param issuedPackId The ID of the issued pack.
     * @param cards An array of TokenIdWithCardId structs containing the token IDs and card IDs to mint.
     * @param ftAmount The amount of FT to transfer for the purchase.
     */
    function packPurchase(
        string calldata requestId,
        address manager,
        address userWalletAddress,
        uint256 issuedPackId,
        ICard.TokenIdWithCardId[] calldata cards,
        uint256 ftAmount
    ) external onlyRole(OPERATOR_ROLE) {
        bytes32 eventHash = keccak256(abi.encodePacked(issuedPackId));
        ftSender.transfer(userWalletAddress, manager, ftAmount, eventHash);

        card.bulkMint(userWalletAddress, cards);

        emit PackOpen(requestId, issuedPackId);
    }

    /**
     * @notice Opens a set of packs and mints the corresponding NFTs to the specified address.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the request.
     * @param to The address to receive the minted NFTs.
     * @param packSetId The ID of the pack set.
     * @param packs An array of PackIdWithCards structs containing the pack IDs and the NFTs to mint.
     */
    function packSetOpen(
        string calldata requestId,
        address to,
        string calldata packSetId,
        PackIdWithCards[] calldata packs
    ) external onlyRole(OPERATOR_ROLE) {
        for (uint256 i = 0; i < packs.length; ) {
            card.bulkMint(to, packs[i].cards);

            emit SetPackOpen(requestId, packSetId, packs[i].issuedPackId);
            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Handles the purchase of a set of packs, transferring the required FT amount and minting the corresponding NFTs.
     * @dev Can only be called by an account with the OPERATOR_ROLE.
     * @param requestId The ID of the request.
     * @param manager The address of the manager receiving the FT.
     * @param userWalletAddress The address of the user purchasing the pack set.
     * @param packSetId The ID of the pack set.
     * @param packs An array of PackIdWithCards structs containing the pack IDs and the NFTs to mint.
     * @param ftAmount The amount of FT to transfer for the purchase.
     */
    function packSetPurchase(
        string calldata requestId,
        address manager,
        address userWalletAddress,
        string calldata packSetId,
        PackIdWithCards[] calldata packs,
        uint256 ftAmount
    ) external onlyRole(OPERATOR_ROLE) {
        bytes32 eventHash = keccak256(abi.encodePacked(packSetId));
        ftSender.transfer(userWalletAddress, manager, ftAmount, eventHash);

        for (uint256 i = 0; i < packs.length; ) {
            card.bulkMint(userWalletAddress, packs[i].cards);

            emit SetPackOpen(requestId, packSetId, packs[i].issuedPackId);
            unchecked {
                i++;
            }
        }
    }
}
