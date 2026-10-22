
CREATE DATABASE IF NOT EXISTS sanad_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE sanad_db;

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) UNIQUE,
    email_address VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    user_role ENUM('ELDERLY', 'HELPER', 'ADMIN') NOT NULL DEFAULT 'ELDERLY',
    account_status ENUM('ACTIVE', 'SUSPENDED', 'DEACTIVATED') NOT NULL DEFAULT 'ACTIVE',
    availability_status ENUM('AVAILABLE', 'BUSY', 'OFFLINE') NOT NULL DEFAULT 'OFFLINE',
    preferred_language VARCHAR(10) NOT NULL DEFAULT 'ar',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_contact CHECK (
        phone_number IS NOT NULL OR email_address IS NOT NULL
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assistance_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    elderly_id INT NOT NULL,
    helper_id INT NULL,
    request_type VARCHAR(100) NOT NULL,
    priority_level ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    description TEXT NULL,
    voice_transcript TEXT NULL,
    location_data JSON NULL,
    resolution_notes TEXT NULL,
    status ENUM(
        'PENDING',
        'ACCEPTED',
        'IN_PROGRESS',
        'COMPLETED',
        'REJECTED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_requests_elderly
        FOREIGN KEY (elderly_id) REFERENCES users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_requests_helper
        FOREIGN KEY (helper_id) REFERENCES users(user_id)
        ON DELETE SET NULL,
    INDEX idx_requests_elderly (elderly_id),
    INDEX idx_requests_helper (helper_id),
    INDEX idx_requests_status (status),
    INDEX idx_requests_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS technical_explanation_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    technical_term VARCHAR(255) NOT NULL,
    explanation TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_explanations_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE,
    INDEX idx_explanations_user (user_id),
    INDEX idx_explanations_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE,
    INDEX idx_notifications_user_read (user_id, is_read),
    INDEX idx_notifications_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reminders (
    reminder_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    reminder_details TEXT NULL,
    reminder_at DATETIME NOT NULL,
    status ENUM('PENDING', 'SENT', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reminders_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE,
    INDEX idx_reminders_user (user_id),
    INDEX idx_reminders_schedule (status, reminder_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id INT NULL,
    action_details VARCHAR(255) NOT NULL,
    target_entity VARCHAR(100) NULL,
    target_id INT NULL,
    ip_address VARCHAR(45) NULL,
    execution_payload JSON NULL,
    logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_actor
        FOREIGN KEY (actor_user_id) REFERENCES users(user_id)
        ON DELETE SET NULL,
    INDEX idx_audit_actor (actor_user_id),
    INDEX idx_audit_logged_at (logged_at),
    INDEX idx_audit_target (target_entity, target_id)
) ENGINE=InnoDB;
