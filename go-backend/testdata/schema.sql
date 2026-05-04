-- Test database schema for MySQL/PostgreSQL/SQLite
-- This schema is used across all database types with minor syntax adjustments

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100),
    age INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table with foreign key
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order items (many-to-many)
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Categories table for tree structure tests
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL,
    parent_id INTEGER,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

-- Test data: Users
INSERT INTO users (username, email, age) VALUES
    ('alice', 'alice@example.com', 25),
    ('bob', 'bob@example.com', 30),
    ('charlie', 'charlie@example.com', 35),
    ('diana', 'diana@example.com', 28),
    ('eve', 'eve@example.com', 22);

-- Test data: Products
INSERT INTO products (name, description, price, stock) VALUES
    ('Laptop', 'High performance laptop', 999.99, 50),
    ('Mouse', 'Wireless mouse', 29.99, 200),
    ('Keyboard', 'Mechanical keyboard', 89.99, 150),
    ('Monitor', '27 inch 4K monitor', 399.99, 30),
    ('Headphones', 'Noise cancelling headphones', 199.99, 80);

-- Test data: Orders
INSERT INTO orders (user_id, amount, status) VALUES
    (1, 1029.98, 'completed'),
    (1, 29.99, 'pending'),
    (2, 489.98, 'completed'),
    (3, 199.99, 'shipped'),
    (4, 999.99, 'pending');

-- Test data: Order items
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (1, 1, 1, 999.99),
    (1, 2, 1, 29.99),
    (2, 2, 1, 29.99),
    (3, 3, 1, 89.99),
    (3, 4, 1, 399.99),
    (4, 5, 1, 199.99),
    (5, 1, 1, 999.99);

-- Test data: Categories
INSERT INTO categories (name, parent_id) VALUES
    ('Electronics', NULL),
    ('Computers', 1),
    ('Accessories', 1),
    ('Laptops', 2),
    ('Desktops', 2),
    ('Mice', 3),
    ('Keyboards', 3);

-- Create indexes for testing
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- Create view for testing
CREATE VIEW IF NOT EXISTS user_order_summary AS
SELECT 
    u.id AS user_id,
    u.username,
    COUNT(o.id) AS total_orders,
    COALESCE(SUM(o.amount), 0) AS total_amount
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.username;

-- Create trigger for testing (SQLite syntax)
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
