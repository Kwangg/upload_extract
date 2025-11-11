CREATE TABLE IF NOT EXISTS  cad_loan.inv_status_restore_db (`chk_status` char(1) default NULL) ENGINE=MyISAM DEFAULT CHARSET=tis620; 
TRUNCATE TABLE cad_loan.inv_status_restore_db;
INSERT INTO cad_loan.inv_status_restore_db (`chk_status`) VALUES ('Y'); 
