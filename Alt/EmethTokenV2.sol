// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

contract EmethToken {

  string public constant name = "Emeth Token";
  string public constant symbol = "EMETH";
  uint256 public constant decimals = 18;
  uint256 public totalSupply = 0;
  
  mapping(address => bool) public minters;

  event Transfer(address indexed from, address indexed to, uint256 value);
  event Approval(address indexed owner, address indexed spender, uint256 value);

  mapping (address => uint256) balances;
  mapping (address => mapping (address => uint256)) internal allowed;

  modifier onlyMinter() {
    require(minters[msg.sender], "EmethToken: no minter role");
    _;
  }

  constructor() {
    balances[msg.sender] = totalSupply;
    minters[msg.sender] = true;
  }
  
  function setMinter(address _minter) external onlyMinter returns (bool) {
    require(_minter != address(0), "EmethToken: cannot set 0x0 as minter");
    minters[_minter] = true;
    return true;
  }

  function removeMinter(address _minter) external onlyMinter returns (bool) {
    require(_minter != msg.sender, "EmethToken: cannot remove yourself");
    minters[_minter] = false;
    return true;
  }

  function transfer(address _to, uint256 _value) public returns (bool) {
    require(_to != address(0), "EmethToken: cannot transfer to zero address");
    require(_value <= balances[msg.sender], "EmethToken: insufficient balance");

    balances[msg.sender] = balances[msg.sender] - _value;
    balances[_to] = balances[_to] + _value;
    emit Transfer(msg.sender, _to, _value);
    return true;
  }

  function balanceOf(address _owner) public view returns (uint256 balance) {
    return balances[_owner];
  }

  function transferFrom(address _from, address _to, uint256 _value) public returns (bool) {
    require(_to != address(0), "EmethToken: cannot transfer to zero address");
    require(_value <= balances[_from], "EmethToken: insufficient balance");
    require(_value <= allowed[_from][msg.sender], "EmethToken: insufficient allowance");

    balances[_from] = balances[_from] - _value;
    balances[_to] = balances[_to] + _value;
    allowed[_from][msg.sender] = allowed[_from][msg.sender] - _value;
    emit Transfer(_from, _to, _value);
    return true;
  }

  /**
   * Changing an allowance with calling this method once has the known risk that someone may use 
   * both the old and the new allowance amount by malicious transactions. We recommend the approve
   * amount first to be reduced 0, and approve the new value in 2-step transactions.
   */
  function approve(address _spender, uint256 _value) public returns (bool) {
    allowed[msg.sender][_spender] = _value;
    emit Approval(msg.sender, _spender, _value);
    return true;
  }

  function allowance(address _owner, address _spender) public view returns (uint256) {
    return allowed[_owner][_spender];
  }
  
  function mint(address _to, uint256 _amount) external onlyMinter returns (bool) {
    balances[_to] = balances[_to] + _amount;
    totalSupply = totalSupply + _amount;
    emit Transfer(address(0), _to, _amount);
    return true;
  }
  
  function burn(uint256 _amount) external returns (bool) {
    balances[msg.sender] = balances[msg.sender] - _amount;
    totalSupply = totalSupply - _amount;
    emit Transfer(msg.sender, address(0), _amount);
    return true;
  }
}