-- PostgreSQL specific test data initialization
-- Run this after schema.sql

-- PostgreSQL uses SERIAL instead of AUTOINCREMENT

-- Connect to test database
\c testdb;

-- Clear existing data
TRUNCATE TABLE order_items, orders, products, users, categories RESTART IDENTITY CASCADE;

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

-- Create function for testing
CREATE OR REPLACE FUNCTION get_user_orders(p_user_id INT)
RETURNS TABLE (
    id INT,
    amount NUMERIC,
    status VARCHAR,
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT o.id, o.amount, o.status, o.created_at
    FROM orders o
    WHERE o.user_id = p_user_id
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_users_timestamp ON users;
CREATE TRIGGER update_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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
