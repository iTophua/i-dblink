-- MySQL specific test data initialization
-- Run this after schema.sql

-- MySQL uses AUTO_INCREMENT instead of AUTOINCREMENT
-- MySQL uses CURRENT_TIMESTAMP instead of CURRENT_TIMESTAMP (same)

-- Ensure we're using the test database
USE testdb;

-- Clear existing data (if any)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE order_items;
TRUNCATE TABLE orders;
TRUNCATE TABLE products;
TRUNCATE TABLE users;
TRUNCATE TABLE categories;
SET FOREIGN_KEY_CHECKS = 1;

-- Insert test users
INSERT INTO users (username, email, age) VALUES
    ('alice', 'alice@example.com', 25),
    ('bob', 'bob@example.com', 30),
    ('charlie', 'charlie@example.com', 35),
    ('diana', 'diana@example.com', 28),
    ('eve', 'eve@example.com', 22);

-- Insert test products
INSERT INTO products (name, description, price, stock) VALUES
    ('Laptop', 'High performance laptop', 999.99, 50),
    ('Mouse', 'Wireless mouse', 29.99, 200),
    ('Keyboard', 'Mechanical keyboard', 89.99, 150),
    ('Monitor', '27 inch 4K monitor', 399.99, 30),
    ('Headphones', 'Noise cancelling headphones', 199.99, 80);

-- Insert test orders
INSERT INTO orders (user_id, amount, status) VALUES
    (1, 1029.98, 'completed'),
    (1, 29.99, 'pending'),
    (2, 489.98, 'completed'),
    (3, 199.99, 'shipped'),
    (4, 999.99, 'pending');

-- Insert test order items
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (1, 1, 1, 999.99),
    (1, 2, 1, 29.99),
    (2, 2, 1, 29.99),
    (3, 3, 1, 89.99),
    (3, 4, 1, 399.99),
    (4, 5, 1, 199.99),
    (5, 1, 1, 999.99);

-- Insert test categories
INSERT INTO categories (name, parent_id) VALUES
    ('Electronics', NULL),
    ('Computers', 1),
    ('Accessories', 1),
    ('Laptops', 2),
    ('Desktops', 2),
    ('Mice', 3),
    ('Keyboards', 3);

-- Create stored procedure for testing
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS GetUserOrders(IN p_user_id INT)
BEGIN
    SELECT 
        o.id,
        o.amount,
        o.status,
        o.created_at
    FROM orders o
    WHERE o.user_id = p_user_id
    ORDER BY o.created_at DESC;
END //
DELIMITER ;

-- Create function for testing
DELIMITER //
CREATE FUNCTION IF NOT EXISTS GetUserTotalSpent(p_user_id INT)
RETURNS DECIMAL(10,2)
DETERMINISTIC
BEGIN
    DECLARE total DECIMAL(10,2);
    SELECT COALESCE(SUM(amount), 0) INTO total
    FROM orders
    WHERE user_id = p_user_id;
    RETURN total;
END //
DELIMITER ;

-- Create event for testing (disabled by default)
CREATE EVENT IF NOT EXISTS test_event
ON SCHEDULE EVERY 1 DAY
DO
    UPDATE products SET stock = stock + 1 WHERE stock < 1000;

-- Verify data
SELECT 'Users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'Orders', COUNT(*) FROM orders
UNION ALL
SELECT 'Products', COUNT(*) FROM products
UNION ALL
SELECT 'Order Items', COUNT(*) FROM order_items
UNION ALL
SELECT 'Categories', COUNT(*) FROM categories;
