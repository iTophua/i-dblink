import React, { useState } from 'react';
import { 
  Layout, Menu, Typography, Space, Button, Divider, Card, 
  Table, Tag, ColorPicker, theme, Switch, Tabs, Input, 
  Form, Modal, message, Descriptions, Progress, Badge, Avatar 
} from 'antd';
import {
  DatabaseOutlined,
  TableOutlined,
  CodeOutlined,
  ApiOutlined,
  FileTextOutlined,
  CloudServerOutlined,
  SunOutlined,
  ClusterOutlined,
  BlockOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CloseCircleOutlined,
  MoonOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  UploadOutlined,
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

/**
 * UI Design Showcase Component
 * 展示 i-dblink 的完整 UI 设计规范
 */
export function UIDesignShowcase() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('colors');

  // 主题色配置
  const themeColors = {
    primary: '#1890ff',
    success: '#52c41a',
    warning: '#faad14',
    error: '#ff4d4f',
    info: '#1890ff',
  };

  // 数据库类型配色
  const dbTypes = [
    { name: 'MySQL', color: '#1890ff', icon: <DatabaseOutlined /> },
    { name: 'PostgreSQL', color: '#52c41a', icon: <ApiOutlined /> },
    { name: 'SQLite', color: '#faad14', icon: <FileTextOutlined /> },
    { name: 'SQL Server', color: '#eb2f96', icon: <CloudServerOutlined /> },
    { name: 'Oracle', color: '#fa8c16', icon: <SunOutlined /> },
    { name: 'MariaDB', color: '#13c2c2', icon: <ClusterOutlined /> },
    { name: '达梦 DM', color: '#722ed1', icon: <BlockOutlined /> },
  ];

  // 示例表格数据
  const tableData = [
    { key: '1', name: 'users', rows: '10,234', size: '2.3 MB', engine: 'InnoDB' },
    { key: '2', name: 'orders', rows: '52,891', size: '8.7 MB', engine: 'InnoDB' },
    { key: '3', name: 'products', rows: '1,523', size: '456 KB', engine: 'InnoDB' },
    { key: '4', name: 'logs', rows: '123,456', size: '23.4 MB', engine: 'MyISAM' },
  ];

  const tableColumns = [
    { title: '表名', dataIndex: 'name', key: 'name' },
    { title: '行数', dataIndex: 'rows', key: 'rows' },
    { title: '大小', dataIndex: 'size', key: 'size' },
    { title: '引擎', dataIndex: 'engine', key: 'engine' },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />}>查看</Button>
          <Button type="link" size="small" icon={<EditOutlined />}>编辑</Button>
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: darkMode ? '#1f1f1f' : '#f0f2f5' }}>
      {/* 顶部导航 */}
      <Header style={{ 
        background: darkMode ? '#141414' : '#fff', 
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <Space>
          <DatabaseOutlined style={{ fontSize: 24, color: themeColors.primary }} />
          <Title level={4} style={{ margin: 0, color: darkMode ? '#fff' : '#000' }}>
            i-dblink UI Design System
          </Title>
        </Space>
        <Space>
          <Text style={{ color: darkMode ? '#bfbfbf' : '#595959' }}>暗黑模式</Text>
          <Switch 
            checked={darkMode} 
            onChange={setDarkMode}
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<SunOutlined />}
          />
        </Space>
      </Header>

      <Content style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {/* 设计概览卡片 */}
        <Card 
          style={{ marginBottom: 24, background: darkMode ? '#1f1f1f' : '#fff' }}
          bodyStyle={{ padding: '24px' }}
        >
          <Title level={2} style={{ color: darkMode ? '#fff' : '#000', marginBottom: 16 }}>
            设计概览
          </Title>
          <Paragraph style={{ color: darkMode ? '#bfbfbf' : '#595959', fontSize: 16 }}>
            i-dblink 是一款跨平台数据库管理工具，采用 Ant Design 5 设计系统，
            提供专业、高效、易用的用户界面。支持 MySQL、PostgreSQL、SQLite、
            SQL Server、Oracle、MariaDB 及国产达梦数据库。
          </Paragraph>
          
          <Descriptions bordered size="middle" column={3}>
            <Descriptions.Item label="UI 框架">Ant Design 5.x</Descriptions.Item>
            <Descriptions.Item label="前端框架">React 18 + TypeScript</Descriptions.Item>
            <Descriptions.Item label="桌面框架">Tauri v2 + Rust</Descriptions.Item>
            <Descriptions.Item label="状态管理">Zustand</Descriptions.Item>
            <Descriptions.Item label="SQL 编辑器">Monaco Editor</Descriptions.Item>
            <Descriptions.Item label="数据网格">AG Grid</Descriptions.Item>
          </Descriptions>
        </Card>

        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          type="card"
          items={[
            {
              key: 'colors',
              label: <span><InfoCircleOutlined /> 色彩系统</span>,
              children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  {/* 主题色 */}
                  <Card 
                    title="主题色" 
                    style={{ background: darkMode ? '#1f1f1f' : '#fff' }}
                    headStyle={{ borderBottom: `2px solid ${themeColors.primary}` }}
                  >
                    <Space wrap size="large">
                      {Object.entries(themeColors).map(([key, value]) => (
                        <div key={key} style={{ textAlign: 'center' }}>
                          <div 
                            style={{ 
                              width: 80, 
                              height: 80, 
                              borderRadius: 8, 
                              background: value,
                              marginBottom: 8,
                              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                            }} 
                          />
                          <Text strong style={{ color: darkMode ? '#fff' : '#000' }}>
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                          </Text>
                          <br />
                          <Text code style={{ fontSize: 12 }}>{value}</Text>
                        </div>
                      ))}
                    </Space>
                  </Card>

                  {/* 数据库类型色 */}
                  <Card 
                    title="数据库类型配色" 
                    style={{ background: darkMode ? '#1f1f1f' : '#fff' }}
                  >
                    <Space wrap size="large">
                      {dbTypes.map((db) => (
                        <div key={db.name} style={{ textAlign: 'center' }}>
                          <div 
                            style={{ 
                              width: 80, 
                              height: 80, 
                              borderRadius: 12, 
                              background: darkMode ? '#141414' : '#fafafa',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginBottom: 8,
                              border: `2px solid ${db.color}`
                            }} 
                          >
                            <span style={{ fontSize: 32, color: db.color }}>
                              {db.icon}
                            </span>
                          </div>
                          <Text strong style={{ color: darkMode ? '#fff' : '#000' }}>
                            {db.name}
                          </Text>
                          <br />
                          <Tag color={db.color}>{db.color}</Tag>
                        </div>
                      ))}
                    </Space>
                  </Card>

                  {/* 中性色 */}
                  <Card 
                    title="中性色（浅色模式）" 
                    style={{ background: darkMode ? '#1f1f1f' : '#fff' }}
                  >
                    <Space wrap size="large">
                      {[
                        { name: '主要文字', color: '#0f0f0f' },
                        { name: '次要文字', color: '#595959' },
                        { name: '辅助文字', color: '#8c8c8c' },
                        { name: '边框色', color: '#d9d9d9' },
                        { name: '背景色', color: '#f6f6f6' },
                        { name: '工具栏背景', color: '#fafafa' },
                      ].map((item) => (
                        <div key={item.name} style={{ textAlign: 'center' }}>
                          <div 
                            style={{ 
                              width: 80, 
                              height: 80, 
                              borderRadius: 8, 
                              background: item.color,
                              marginBottom: 8,
                              border: '1px solid #e8e8e8'
                            }} 
                          />
                          <Text style={{ color: darkMode ? '#fff' : '#000' }}>{item.name}</Text>
                          <br />
                          <Text code style={{ fontSize: 12 }}>{item.color}</Text>
                        </div>
                      ))}
                    </Space>
                  </Card>
                </Space>
              ),
            },
            {
              key: 'typography',
              label: <span><Text /> 字体排印</span>,
              children: (
                <Card 
                  title="字体规范" 
                  style={{ background: darkMode ? '#1f1f1f' : '#fff' }}
                >
                  <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    <div>
                      <Title level={1} style={{ color: darkMode ? '#fff' : '#000' }}>
                        标题 H1 - 20px
                      </Title>
                      <Title level={2} style={{ color: darkMode ? '#fff' : '#000' }}>
                        标题 H2 - 16px
                      </Title>
                      <Title level={3} style={{ color: darkMode ? '#fff' : '#000' }}>
                        标题 H3 - 14px
                      </Title>
                      <Paragraph style={{ color: darkMode ? '#bfbfbf' : '#595959' }}>
                        正文文本 - 14px / 行高 22px / 字重 400<br/>
                        用于常规内容展示，保持舒适的阅读体验。
                      </Paragraph>
                      <Text style={{ color: darkMode ? '#8c8c8c' : '#8c8c8c', fontSize: 12 }}>
                        辅助文字 - 12px / 用于提示、说明等次要信息
                      </Text>
                    </div>

                    <Divider />

                    <div>
                      <Title level={4} style={{ color: darkMode ? '#fff' : '#000', marginBottom: 16 }}>
                        字色示例
                      </Title>
                      <Space direction="vertical" size="middle">
                        <Text style={{ color: darkMode ? '#f6f6f6' : '#0f0f0f', fontSize: 16 }}>
                          主要文字 #0f0f0f（浅色） / #f6f6f6（深色）
                        </Text>
                        <Text style={{ color: darkMode ? '#bfbfbf' : '#595959', fontSize: 14 }}>
                          次要文字 #595959（浅色） / #bfbfbf（深色）
                        </Text>
                        <Text style={{ color: darkMode ? '#595959' : '#8c8c8c', fontSize: 12 }}>
                          辅助文字 #8c8c8c（浅色） / #595959（深色）
                        </Text>
                        <a href="#" style={{ color: themeColors.primary }}>
                          链接文字 #1890ff
                        </a>
                      </Space>
                    </div>

                    <Divider />

                    <div>
                      <Title level={4} style={{ color: darkMode ? '#fff' : '#000', marginBottom: 16 }}>
                        代码字体
                      </Title>
                      <Text code style={{ 
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontSize: 14,
                        padding: '4px 8px'
                      }}>
                        SELECT * FROM users WHERE id = 1;
                      </Text>
                    </div>
                  </Space>
                </Card>
              ),
            },
            {
              key: 'components',
              label: <span><ThunderboltOutlined /> 组件示例</span>,
              children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  {/* 按钮 */}
                  <Card 
                    title="按钮组件" 
                    style={{ background: darkMode ? '#1f1f1f' : '#fff' }}
                  >
                    <Space wrap size="middle">
                      <Button type="primary" icon={<PlusOutlined />}>主要按钮</Button>
                      <Button icon={<SaveOutlined />}>默认按钮</Button>
                      <Button type="dashed">虚线按钮</Button>
                      <Button type="link">链接按钮</Button>
                      <Button icon={<DownloadOutlined />} />
                      <Button type="primary" loading>加载中</Button>
                      <Button type="primary" danger>危险操作</Button>
                    </Space>
                    
                    <Divider />
                    
                    <Space wrap size="middle">
                      <Button type="primary" size="large">大型按钮</Button>
                      <Button type="primary" size="middle">中等按钮</Button>
                      <Button type="primary" size="small">小型按钮</Button>
                    </Space>
                  </Card>

                  {/* 状态反馈 */}
                  <Card 
                    title="状态与反馈" 
                    style={{ background: darkMode ? '#1f1f1f' : '#fff' }}
                  >
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                      <Space wrap>
                        <Badge count={5} offset={[0, 0]}>
                          <Button icon={<BellOutlined />}>消息</Button>
                        </Badge>
                        <Badge count={12} offset={[0, 0]} overflowCount={10}>
                          <Button icon={<MailOutlined />}>邮件</Button>
                        </Badge>
                        <Badge dot offset={[0, 0]}>
                          <Button icon={<NotificationOutlined />}>通知</Button>
                        </Badge>
                      </Space>

                      <Divider />

                      <Space wrap>
                        <Tag color="success">成功</Tag>
                        <Tag color="processing">进行中</Tag>
                        <Tag color="warning">警告</Tag>
                        <Tag color="error">错误</Tag>
                        <Tag color="default">默认</Tag>
                      </Space>

                      <Divider />

                      <Space direction="vertical">
                        <Progress percent={75} status="active" strokeColor={themeColors.primary} />
                        <Progress percent={100} status="success" />
                        <Progress percent={60} status="exception" />
                      </Space>
                    </Space>
                  </Card>

                  {/* 数据表格 */}
                  <Card 
                    title="数据表格" 
                    style={{ background: darkMode ? '#1f1f1f' : '#fff' }}
                  >
                    <Table 
                      columns={tableColumns} 
                      dataSource={tableData} 
                      pagination={{ pageSize: 10 }}
                      size="middle"
                    />
                  </Card>

                  {/* 表单组件 */}
                  <Card 
                    title="表单组件" 
                    style={{ background: darkMode ? '#1f1f1f' : '#fff' }}
                  >
                    <Form layout="vertical" style={{ maxWidth: 600 }}>
                      <Form.Item label="连接名称" required>
                        <Input placeholder="请输入连接名称" />
                      </Form.Item>
                      <Form.Item label="数据库类型" required>
                        <Select placeholder="请选择数据库类型">
                          {dbTypes.map(db => (
                            <Select.Option key={db.name} value={db.name}>
                              <Space>
                                <span style={{ color: db.color }}>{db.icon}</span>
                                {db.name}
                              </Space>
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Form.Item label="主机地址" required>
                        <Input addonBefore="Host" placeholder="localhost" />
                      </Form.Item>
                      <Form.Item label="端口">
                        <Input type="number" defaultValue={3306} />
                      </Form.Item>
                      <Form.Item>
                        <Space>
                          <Button type="primary">确定</Button>
                          <Button>取消</Button>
                        </Space>
                      </Form.Item>
                    </Form>
                  </Card>
                </Space>
              ),
            },
            {
              key: 'icons',
              label: <span><CodeOutlined /> 图标库</span>,
              children: (
                <Card 
                  title="常用图标映射" 
                  style={{ background: darkMode ? '#1f1f1f' : '#fff' }}
                >
                  <Space wrap size="large">
                    {[
                      { name: '数据库', icon: <DatabaseOutlined />, size: 24 },
                      { name: '表', icon: <TableOutlined />, size: 24 },
                      { name: 'SQL', icon: <CodeOutlined />, size: 24 },
                      { name: '文件', icon: <FileTextOutlined />, size: 24 },
                      { name: '编辑', icon: <EditOutlined />, size: 24 },
                      { name: '查看', icon: <EyeOutlined />, size: 24 },
                      { name: '设置', icon: <SettingOutlined />, size: 24 },
                      { name: '新建', icon: <PlusOutlined />, size: 24 },
                      { name: '保存', icon: <SaveOutlined />, size: 24 },
                      { name: '删除', icon: <DeleteOutlined />, size: 24 },
                      { name: '刷新', icon: <ReloadOutlined />, size: 24 },
                      { name: '搜索', icon: <SearchOutlined />, size: 24 },
                      { name: '下载', icon: <DownloadOutlined />, size: 24 },
                      { name: '上传', icon: <UploadOutlined />, size: 24 },
                      { name: '执行', icon: <ThunderboltOutlined />, size: 24 },
                    ].map((item) => (
                      <div key={item.name} style={{ textAlign: 'center', width: 80 }}>
                        <div 
                          style={{ 
                            fontSize: item.size, 
                            color: themeColors.primary,
                            marginBottom: 8,
                            height: 40,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {item.icon}
                        </div>
                        <Text style={{ color: darkMode ? '#bfbfbf' : '#595959', fontSize: 12 }}>
                          {item.name}
                        </Text>
                      </div>
                    ))}
                  </Space>
                </Card>
              ),
            },
            {
              key: 'layout',
              label: <span><Layout /> 布局规范</span>,
              children: (
                <Card 
                  title="三栏布局结构" 
                  style={{ background: darkMode ? '#1f1f1f' : '#fff' }}
                >
                  <div 
                    style={{ 
                      border: '2px solid #1890ff', 
                      borderRadius: 8, 
                      padding: 16,
                      background: darkMode ? '#141414' : '#fafafa'
                    }}
                  >
                    {/* 菜单栏 */}
                    <div style={{ 
                      height: 32, 
                      background: themeColors.primary, 
                      borderRadius: 4,
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 16,
                      color: '#fff',
                      fontWeight: 'bold'
                    }}>
                      菜单栏 (32px)
                    </div>
                    
                    {/* 工具栏 */}
                    <div style={{ 
                      height: 40, 
                      background: '#52c41a', 
                      borderRadius: 4,
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 16,
                      color: '#fff',
                      fontWeight: 'bold'
                    }}>
                      工具栏 (40px)
                    </div>

                    {/* 主体内容 */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {/* 左侧边栏 */}
                      <div style={{ 
                        width: 120, 
                        height: 200, 
                        background: '#1890ff', 
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 'bold',
                        writingMode: 'vertical-rl'
                      }}>
                        连接树 (280px)
                      </div>
                      
                      {/* 中间面板 */}
                      <div style={{ 
                        width: 120, 
                        height: 200, 
                        background: '#13c2c2', 
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 'bold',
                        writingMode: 'vertical-rl'
                      }}>
                        对象列表 (320px)
                      </div>
                      
                      {/* 工作区 */}
                      <div style={{ 
                        flex: 1, 
                        height: 200, 
                        background: '#722ed1', 
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 'bold'
                      }}>
                        主工作区 (自适应)
                      </div>
                    </div>

                    {/* 日志面板 */}
                    <div style={{ 
                      height: 60, 
                      background: '#faad14', 
                      borderRadius: 4,
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 'bold'
                    }}>
                      日志面板 (180px)
                    </div>

                    {/* 状态栏 */}
                    <div style={{ 
                      height: 28, 
                      background: '#8c8c8c', 
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: 12
                    }}>
                      状态栏 (28px)
                    </div>
                  </div>

                  <Divider />

                  <Title level={5} style={{ color: darkMode ? '#fff' : '#000' }}>
                    尺寸规范
                  </Title>
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="最小窗口尺寸">1024×768</Descriptions.Item>
                    <Descriptions.Item label="推荐分辨率">1920×1080</Descriptions.Item>
                    <Descriptions.Item label="左侧边栏宽度">280px（可折叠）</Descriptions.Item>
                    <Descriptions.Item label="中间面板宽度">320px（可折叠）</Descriptions.Item>
                    <Descriptions.Item label="日志面板高度">180px（可折叠）</Descriptions.Item>
                    <Descriptions.Item label="状态栏高度">28px</Descriptions.Item>
                  </Descriptions>
                </Card>
              ),
            },
          ]}
        />
      </Content>
    </Layout>
  );
}

// 补充缺失的图标导入
const SaveOutlined = () => <span>💾</span>;
const BellOutlined = () => <span>🔔</span>;
const MailOutlined = () => <span>✉️</span>;
const NotificationOutlined = () => <span>📢</span>;
