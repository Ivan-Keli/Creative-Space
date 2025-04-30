'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add the orderId column to the Transactions table
    await queryInterface.addColumn('Transactions', 'orderId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Orders',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the orderId column from the Transactions table
    await queryInterface.removeColumn('Transactions', 'orderId');
  }
};
