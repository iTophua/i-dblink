import { useState, useEffect, useRef } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';

interface CreateDatabaseDialogProps {
  open: boolean;
  connectionId: string;
  dbType?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

// 达梦数据库字符集（暂不支持动态查询）
const DAMENG_CHARSETS = [
  { label: 'UTF-8 (Unicode)', value: 'UTF8' },
  { label: 'GBK (简体中文)', value: 'GBK' },
  { label: 'GB18030 (国家强制标准)', value: 'GB18030' },
];

export function CreateDatabaseDialog({
  open,
  connectionId,
  dbType,
  onCancel,
  onSuccess,
}: CreateDatabaseDialogProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedCharset, setSelectedCharset] = useState<string>('utf8mb4');
  const [charsetOptions, setCharsetOptions] = useState<{ label: string; value: string }[]>([]);
  const [collationOptions, setCollationOptions] = useState<{ label: string; value: string }[]>([]);
  const [charsetCollationsMap, setCharsetCollationsMap] = useState<
    Record<string, { label: string; value: string }[]>
  >({});

  // 防止重复加载
  const loadingRef = useRef(false);
  const lastConnectionIdRef = useRef<string>('');

  // 当弹窗关闭时重置表单
  useEffect(() => {
    if (!open) {
      form.resetFields();
      setSelectedCharset('utf8mb4');
      setCharsetOptions([]);
      setCollationOptions([]);
      setCharsetCollationsMap({});
      lastConnectionIdRef.current = '';
    }
  }, [open, form]);

  // 从数据库动态查询支持的字符集、排序规则及默认值
  useEffect(() => {
    if (!open || !connectionId || loadingRef.current || lastConnectionIdRef.current === connectionId) return;

    loadingRef.current = true;
    lastConnectionIdRef.current = connectionId;

    const loadOptions = async () => {
      try {
        const lowerDbType = (dbType || '').toLowerCase();

        if (lowerDbType === 'mysql' || lowerDbType === 'mariadb') {
          const [charsetResult, collationResult] = await Promise.all([
            api.executeQuery(connectionId, 'SHOW CHARACTER SET'),
            api.executeQuery(connectionId, 'SHOW COLLATION'),
          ]);

          const charsets =
            charsetResult.rows?.map((row) => ({
              label: `${String(row[0])}${row[1] ? ` (${String(row[1])})` : ''}`,
              value: String(row[0]),
            })) || [];

          const collationsMap: Record<string, { label: string; value: string }[]> = {};
          collationResult.rows?.forEach((row) => {
            const collation = String(row[0]);
            const charset = String(row[1]);
            if (!collationsMap[charset]) collationsMap[charset] = [];
            collationsMap[charset].push({ label: collation, value: collation });
          });

          const [defaultCharsetResult, defaultCollationResult] = await Promise.all([
            api.executeQuery(connectionId, "SHOW VARIABLES LIKE 'character_set_server'"),
            api.executeQuery(connectionId, "SHOW VARIABLES LIKE 'collation_server'"),
          ]);

          setCharsetOptions(charsets);
          setCharsetCollationsMap(collationsMap);

          if (defaultCharsetResult.rows?.[0]) {
            const charset = String(defaultCharsetResult.rows[0][1]);
            setSelectedCharset(charset);
            setCollationOptions(collationsMap[charset] || []);
            form.setFieldsValue({ charset, collation: undefined });
          }

          if (defaultCollationResult.rows?.[0]) {
            form.setFieldValue('collation', String(defaultCollationResult.rows[0][1]));
          }
        } else if (
          ['postgresql', 'kingbase', 'highgo', 'vastbase'].includes(lowerDbType)
        ) {
          const [encodingResult, collationResult] = await Promise.all([
            api.executeQuery(
              connectionId,
              "SELECT DISTINCT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE encoding IS NOT NULL"
            ),
            api.executeQuery(
              connectionId,
              "SELECT collname FROM pg_collation WHERE collname NOT LIKE 'pg_%' ORDER BY collname"
            ),
          ]);

          const encodings =
            encodingResult.rows?.map((row) => ({
              label: String(row[0]),
              value: String(row[0]),
            })) || [];

          const collations =
            collationResult.rows?.map((row) => ({
              label: String(row[0]),
              value: String(row[0]),
            })) || [];

          const [defaultEncodingResult, defaultLocaleResult] = await Promise.all([
            api.executeQuery(connectionId, 'SHOW server_encoding'),
            api.executeQuery(connectionId, 'SHOW lc_collate'),
          ]);

          setCharsetOptions(encodings);
          setCollationOptions(collations);

          form.setFieldsValue({
            charset: defaultEncodingResult.rows?.[0] ? String(defaultEncodingResult.rows[0][0]) : undefined,
            collation: defaultLocaleResult.rows?.[0] ? String(defaultLocaleResult.rows[0][0]) : undefined,
          });
        } else if (lowerDbType === 'sqlserver') {
          const [collationResult, defaultResult] = await Promise.all([
            api.executeQuery(connectionId, 'SELECT name, description FROM fn_helpcollations()'),
            api.executeQuery(
              connectionId,
              "SELECT CAST(SERVERPROPERTY('Collation') AS NVARCHAR(128)) AS Collation"
            ),
          ]);

          const collations =
            collationResult.rows?.map((row) => ({
              label: `${String(row[0])}${row[1] ? ` (${String(row[1])})` : ''}`,
              value: String(row[0]),
            })) || [];

          setCollationOptions(collations);

          if (defaultResult.rows?.[0]) {
            form.setFieldValue('collation', String(defaultResult.rows[0][0]));
          }
        } else if (lowerDbType === 'dameng') {
          setCharsetOptions(DAMENG_CHARSETS);
        }
      } catch {
        // 静默失败
      } finally {
        loadingRef.current = false;
      }
    };

    loadOptions();
  }, [open, connectionId, dbType, form]);

  const handleCharsetChange = (charset: string) => {
    setSelectedCharset(charset);
    if (charsetCollationsMap[charset]) {
      setCollationOptions(charsetCollationsMap[charset]);
    }
    form.setFieldValue('collation', undefined);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const dbName = values.databaseName.trim();

      let sql = '';
      const upperDbType = (dbType || '').toUpperCase();

      if (upperDbType === 'MYSQL' || upperDbType === 'MARIADB') {
        sql = `CREATE DATABASE \`${dbName}\``;
        if (values.charset) {
          sql += ` DEFAULT CHARACTER SET \`${values.charset}\``;
        }
        if (values.collation) {
          sql += ` DEFAULT COLLATE \`${values.collation}\``;
        }
        sql += ';';
      } else if (upperDbType === 'SQLSERVER') {
        sql = `CREATE DATABASE [${dbName}]`;
        if (values.collation) {
          sql += ` COLLATE ${values.collation}`;
        }
        sql += ';';
      } else if (upperDbType === 'POSTGRESQL' || upperDbType === 'KINGBASE' || upperDbType === 'HIGHGO' || upperDbType === 'VASTBASE') {
        sql = `CREATE DATABASE "${dbName}"`;
        if (values.charset) {
          sql += ` WITH ENCODING = '${values.charset}'`;
        }
        if (values.collation) {
          sql += ` LC_COLLATE = '${values.collation}'`;
        }
        if (values.owner) {
          sql += ` OWNER = "${values.owner}"`;
        }
        sql += ';';
      } else if (upperDbType === 'ORACLE') {
        message.warning(t('common.oracleCreateDatabaseWarning'));
        setLoading(false);
        return;
      } else if (upperDbType === 'DAMENG') {
        sql = `CREATE DATABASE "${dbName}"`;
        if (values.charset) {
          sql += ` CHARSET '${values.charset}'`;
        }
        sql += ';';
      } else if (upperDbType === 'SQLITE') {
        message.info(t('common.sqliteDatabaseInfo'));
        setLoading(false);
        onCancel();
        return;
      } else {
        sql = `CREATE DATABASE \`${dbName}\``;
        if (values.charset) {
          sql += ` DEFAULT CHARACTER SET \`${values.charset}\``;
        }
        sql += ';';
      }

      await api.executeDDL(connectionId, sql);
      message.success(t('common.databaseCreatedSuccess'));
      form.resetFields();
      onSuccess();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`${t('common.error')}: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const lowerDbType = (dbType || '').toLowerCase();
  const isMySQL = lowerDbType === 'mysql' || lowerDbType === 'mariadb';
  const isSQLServer = lowerDbType === 'sqlserver';
  const isPostgreSQL = ['postgresql', 'kingbase', 'highgo', 'vastbase'].includes(lowerDbType);
  const isDameng = lowerDbType === 'dameng';

  return (
    <Modal
      title={t('common.createDatabase')}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      width={520}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      destroyOnClose={false}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ charset: 'utf8mb4' }}
      >
        <Form.Item
          name="databaseName"
          label={t('common.databaseName')}
          rules={[
            { required: true, message: t('common.pleaseEnterDatabaseName') },
            { pattern: /^[a-zA-Z0-9_一-龥]+$/, message: t('common.invalidDatabaseName') },
          ]}
        >
          <Input placeholder={t('common.pleaseEnterDatabaseName')} autoFocus />
        </Form.Item>

        {isMySQL && (
          <>
            <Form.Item name="charset" label={t('common.charset')}>
              <Select
                placeholder={t('common.selectCharset')}
                options={charsetOptions}
                onChange={handleCharsetChange}
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>

            <Form.Item name="collation" label={t('common.collation')}>
              <Select
                placeholder={t('common.selectCollation')}
                options={collationOptions}
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </>
        )}

        {isSQLServer && (
          <Form.Item name="collation" label={t('common.collation')}>
            <Select
              placeholder={t('common.selectCollation')}
              options={collationOptions}
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        )}

        {isPostgreSQL && (
          <>
            <Form.Item name="charset" label={t('common.charset')}>
              <Select
                placeholder={t('common.selectCharset')}
                options={charsetOptions}
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>

            <Form.Item name="collation" label={t('common.collation')}>
              <Select
                placeholder={t('common.selectCollation')}
                options={collationOptions}
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>

            <Form.Item name="owner" label={t('common.databaseOwner')}>
              <Input placeholder={t('common.pleaseEnterOwner')} />
            </Form.Item>
          </>
        )}

        {isDameng && (
          <Form.Item name="charset" label={t('common.charset')}>
            <Select
              placeholder={t('common.selectCharset')}
              options={DAMENG_CHARSETS}
              allowClear
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
