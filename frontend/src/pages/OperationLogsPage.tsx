import { Alert, Card, Grid, Input, Select, Space, Table, Tag, Typography } from '@arco-design/web-react';
import { useMemo, useState } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';
import type { OperationLog, WebsiteAdminRole } from '../types';
import { operationLogActionLabelMap } from '../utils/operationLog';
import { websiteAdminRoleColorMap, websiteAdminRoleLabelMap } from '../utils/websiteAdmin';

const { Row, Col } = Grid;
const Option = Select.Option;

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

export const OperationLogsPage = () => {
  const { operationLogs } = useAppStore();
  const [roleFilter, setRoleFilter] = useState<'all' | WebsiteAdminRole>('all');
  const [keyword, setKeyword] = useState('');

  const filteredLogs = useMemo(() => {
    const search = keyword.trim().toLowerCase();

    return operationLogs.filter((log) => {
      const matchesRole = roleFilter === 'all' ? true : log.operatorRole === roleFilter;
      const matchesKeyword =
        !search ||
        log.operatorName.toLowerCase().includes(search) ||
        operationLogActionLabelMap[log.action].toLowerCase().includes(search) ||
        log.detail.toLowerCase().includes(search);

      return matchesRole && matchesKeyword;
    });
  }, [keyword, operationLogs, roleFilter]);

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 190,
      render: (value: string) => formatTime(value),
      sorter: (a: OperationLog, b: OperationLog) => a.createdAt.localeCompare(b.createdAt),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      width: 180,
      render: (_value: string, record: OperationLog) => (
        <Space direction="vertical" size="mini">
          <Typography.Text style={{ fontWeight: 600 }}>{record.operatorName}</Typography.Text>
          <Tag color={websiteAdminRoleColorMap[record.operatorRole]}>
            {websiteAdminRoleLabelMap[record.operatorRole]}
          </Tag>
        </Space>
      ),
    },
    {
      title: '操作动作',
      dataIndex: 'action',
      width: 180,
      render: (value: OperationLog['action']) => <Tag color="arcoblue">{operationLogActionLabelMap[value]}</Tag>,
    },
    {
      title: '详细信息',
      dataIndex: 'detail',
      render: (value: string) => value,
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title heading={4} style={{ marginBottom: 8 }}>
          操作日志
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          记录系统管理员和普通管理员在网站中的关键操作，包括操作时间、操作人、操作动作和详细信息。日志为只追加记录，不提供任何编辑或删除能力。
        </Typography.Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        content="操作日志为只读历史记录。当前前端原型中，任何管理员都无法修改或删除这些日志。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="metric-card">
            <Typography.Text type="secondary">日志总数</Typography.Text>
            <Typography.Title heading={3}>{operationLogs.length}</Typography.Title>
            <Typography.Text>按时间倒序展示最新管理员操作</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="metric-card">
            <Typography.Text type="secondary">系统管理员日志</Typography.Text>
            <Typography.Title heading={3}>
              {operationLogs.filter((log) => log.operatorRole === 'system_admin').length}
            </Typography.Title>
            <Typography.Text>包含管理员资料维护等系统级操作</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="metric-card">
            <Typography.Text type="secondary">普通管理员日志</Typography.Text>
            <Typography.Title heading={3}>
              {operationLogs.filter((log) => log.operatorRole === 'normal_admin').length}
            </Typography.Title>
            <Typography.Text>包含社区与白名单等日常业务操作</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Card title="日志筛选">
        <Space wrap>
          <Select value={roleFilter} style={{ width: 180 }} onChange={(value) => setRoleFilter(value)}>
            <Option value="all">全部角色</Option>
            <Option value="system_admin">系统管理员</Option>
            <Option value="normal_admin">普通管理员</Option>
          </Select>
          <Input.Search
            allowClear
            style={{ width: 320 }}
            placeholder="搜索操作人、动作或详细信息"
            value={keyword}
            onChange={setKeyword}
          />
        </Space>
      </Card>

      <Card title="日志列表">
        <Table rowKey="id" columns={columns} data={filteredLogs} pagination={{ pageSize: 8 }} />
      </Card>
    </Space>
  );
};
