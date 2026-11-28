/**
 * 复制表时的 DDL 改写：只改表名和约束 / 索引名，列名、注释、默认值不能动。
 */
import { describe, it, expect } from 'vitest';
import { rewriteDDLForCopy } from '../../utils/ddlCopy';

const MYSQL_DDL = `CREATE TABLE \`order\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`order_no\` varchar(32) NOT NULL COMMENT 'order number of the order',
  \`user_id\` int NOT NULL,
  \`config\` json DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`order_no\` (\`order_no\`),
  KEY \`idx_user\` (\`user_id\`),
  KEY \`order\` ((\`order_no\`)),
  CONSTRAINT \`order_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\` (\`id\`),
  CONSTRAINT \`order_chk_1\` CHECK ((\`order_no\` <> ''))
) ENGINE=InnoDB AUTO_INCREMENT=5 COMMENT='order master'`;

describe('rewriteDDLForCopy', () => {
  it('MySQL：只改表名和含表名的约束 / 索引名，列名和注释原样保留', () => {
    // 此前是整段子串替换：列 order_no 会变成 order_copy_no，注释里的 order 也被改掉
    const out = rewriteDDLForCopy(MYSQL_DDL, 'order', 'order_copy');
    expect(out).toContain('CREATE TABLE `order_copy` (');
    expect(out).toContain("`order_no` varchar(32) NOT NULL COMMENT 'order number of the order'");
    expect(out).toContain('`config` json DEFAULT NULL');
    expect(out).toContain('KEY `idx_user` (`user_id`)');
    // 约束 / 索引名在库里唯一，照搬会撞名：名字里等于表名的那一段换掉
    expect(out).toContain('UNIQUE KEY `order_copy_no` (`order_no`)');
    expect(out).toContain(
      'CONSTRAINT `order_copy_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)'
    );
    expect(out).toContain('CONSTRAINT `order_copy_chk_1` CHECK');
    expect(out).toContain('KEY `order_copy` ((`order_no`))');
    // 表注释是字符串字面量，不改
    expect(out).toContain("COMMENT='order master'");
    expect(out).not.toContain('user_copy');
    expect(out).not.toContain('order_copy_no` varchar');
  });

  it('自引用的外键指向新表', () => {
    const ddl =
      'CREATE TABLE `node` (`id` int PRIMARY KEY, `pid` int, FOREIGN KEY (`pid`) REFERENCES `node` (`id`))';
    expect(rewriteDDLForCopy(ddl, 'node', 'node_copy')).toBe(
      'CREATE TABLE `node_copy` (`id` int PRIMARY KEY, `pid` int, FOREIGN KEY (`pid`) REFERENCES `node_copy` (`id`))'
    );
  });

  it('pg_dump 风格：限定名只改最后一段，不带引号的名字不区分大小写', () => {
    const ddl =
      'ALTER TABLE ONLY public.Orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);\n' +
      'ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_parent_fkey FOREIGN KEY (parent_id) REFERENCES public.orders(id);';
    const out = rewriteDDLForCopy(ddl, 'orders', 'orders_copy');
    expect(out).toContain(
      'ALTER TABLE ONLY public.orders_copy ADD CONSTRAINT orders_copy_pkey PRIMARY KEY (id)'
    );
    expect(out).toContain('REFERENCES public.orders_copy(id)');
  });

  it('CREATE INDEX：索引名含表名的改掉，表名改掉，列名不动', () => {
    const ddl = 'CREATE INDEX orders_customer_idx ON public.orders (customer_id)';
    expect(rewriteDDLForCopy(ddl, 'orders', 'orders_copy')).toBe(
      'CREATE INDEX orders_copy_customer_idx ON public.orders_copy (customer_id)'
    );
  });

  it('`表`.`列` 前缀里的表名改掉，列名不动', () => {
    const ddl =
      'CREATE TRIGGER trg BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION orders_log()';
    const out = rewriteDDLForCopy(ddl, 'orders', 'orders_copy');
    expect(out).toContain('ON orders_copy FOR EACH ROW');
    // ON UPDATE / 函数名这类位置不动
    expect(out).toContain('EXECUTE FUNCTION orders_log()');
  });

  it('ON DELETE / ON UPDATE 后面不是表，不受影响', () => {
    const ddl =
      'CREATE TABLE `a` (`id` int, FOREIGN KEY (`p`) REFERENCES `b` (`id`) ON DELETE CASCADE ON UPDATE SET NULL)';
    expect(rewriteDDLForCopy(ddl, 'b', 'b_copy')).toContain(
      'REFERENCES `b_copy` (`id`) ON DELETE CASCADE ON UPDATE SET NULL'
    );
  });

  // 只认「按 _ 分段后等于表名」的那一段，不然表名很短时（t）什么名字都会被改
  it('IF NOT EXISTS / TRUNCATE [TABLE] 后面的表名也改', () => {
    expect(
      rewriteDDLForCopy(
        'CREATE TABLE IF NOT EXISTS public.orders (id int)',
        'orders',
        'orders_copy'
      )
    ).toBe('CREATE TABLE IF NOT EXISTS public.orders_copy (id int)');
    expect(rewriteDDLForCopy('TRUNCATE orders;', 'orders', 'orders_copy')).toBe(
      'TRUNCATE orders_copy;'
    );
    expect(rewriteDDLForCopy('TRUNCATE TABLE orders;', 'orders', 'orders_copy')).toBe(
      'TRUNCATE TABLE orders_copy;'
    );
  });

  it('COMMENT ON COLUMN 的 表.列 前缀改表名、留列名', () => {
    expect(
      rewriteDDLForCopy(
        "COMMENT ON COLUMN public.orders.amount IS 'orders amount'",
        'orders',
        'orders_copy'
      )
    ).toBe("COMMENT ON COLUMN public.orders_copy.amount IS 'orders amount'");
  });

  it('名字里只是含有同样的字母、或只是以表名为词干的约束 / 索引不动', () => {
    const ddl =
      'CREATE TABLE `t` (`id` int, `order_no` int, ' +
      'CONSTRAINT fk_customer_user FOREIGN KEY (`id`) REFERENCES `u` (`id`), ' +
      'CONSTRAINT orders_pkey UNIQUE (`order_no`))';
    expect(rewriteDDLForCopy(ddl, 't', 't_copy')).toContain(
      'CREATE TABLE `t_copy` (`id` int, `order_no` int, ' +
        'CONSTRAINT fk_customer_user FOREIGN KEY (`id`) REFERENCES `u` (`id`), ' +
        'CONSTRAINT orders_pkey UNIQUE (`order_no`))'
    );
  });

  it('表名在对象名中间、或大小写不同，也算一段', () => {
    const ddl =
      'CREATE TABLE `Order` (`id` int, `no` int, CONSTRAINT PK_Order PRIMARY KEY (`id`), ' +
      'CONSTRAINT uniq_Order_no UNIQUE (`no`))';
    const out = rewriteDDLForCopy(ddl, 'Order', 'Order_copy');
    expect(out).toContain('CONSTRAINT PK_Order_copy PRIMARY KEY (`id`)');
    expect(out).toContain('CONSTRAINT uniq_Order_copy_no UNIQUE (`no`)');
  });

  it('SQL Server 的方括号标识符', () => {
    const ddl =
      'CREATE TABLE [dbo].[order] ([order_no] int NOT NULL, CONSTRAINT [PK_order] PRIMARY KEY ([order_no]))';
    const out = rewriteDDLForCopy(ddl, 'order', 'order_copy');
    expect(out).toContain('CREATE TABLE [dbo].[order_copy] ([order_no] int NOT NULL');
    expect(out).toContain('CONSTRAINT [PK_order_copy] PRIMARY KEY ([order_no])');
  });

  it('源表名与目标表名相同、或源表名为空时原样返回', () => {
    expect(rewriteDDLForCopy(MYSQL_DDL, 'order', 'order')).toBe(MYSQL_DDL);
    expect(rewriteDDLForCopy(MYSQL_DDL, '', 'x')).toBe(MYSQL_DDL);
  });

  it('改写前后除被替换的标识符外逐字符一致', () => {
    const out = rewriteDDLForCopy(MYSQL_DDL, 'order', 'order_copy');
    expect(out.replace(/_copy/g, '')).toBe(MYSQL_DDL);
  });
});
