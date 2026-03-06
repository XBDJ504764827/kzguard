import { Alert, Card, Grid, List, Progress, Space, Tag, Typography } from '@arco-design/web-react';
import { useMemo } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';

const { Row, Col } = Grid;

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export const OverviewPage = () => {
  const { state } = useAppStore();

  const summary = useMemo(() => {
    const serverCount = state.communities.reduce((count, community) => count + community.servers.length, 0);
    const approvedCount = state.whitelist.filter((player) => player.status === 'approved').length;
    const pendingCount = state.whitelist.filter((player) => player.status === 'pending').length;
    const rejectedCount = state.whitelist.filter((player) => player.status === 'rejected').length;
    const approvalRate = state.whitelist.length
      ? Math.round((approvedCount / state.whitelist.length) * 100)
      : 0;

    return {
      serverCount,
      approvedCount,
      pendingCount,
      rejectedCount,
      approvalRate,
    };
  }, [state]);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title heading={4} style={{ marginBottom: 8 }}>
          管理台概览
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          当前版本聚焦社区组管理与白名单审核流程，后端和插件将在后续迭代中接入。
        </Typography.Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        content="当前为前端原型版本：社区数据、RCON 验证、白名单审核均使用本地状态与模拟流程。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">社区数量</Typography.Text>
            <Typography.Title heading={3}>{state.communities.length}</Typography.Title>
            <Typography.Text>已拆分独立社区与服务器层级</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">服务器数量</Typography.Text>
            <Typography.Title heading={3}>{summary.serverCount}</Typography.Title>
            <Typography.Text>服务器需通过 RCON 校验后才能接入</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">待审核白名单</Typography.Text>
            <Typography.Title heading={3}>{summary.pendingCount}</Typography.Title>
            <Typography.Text>管理员可直接在待审核列表中审批</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">审核通过率</Typography.Text>
            <Typography.Title heading={3}>{summary.approvalRate}%</Typography.Title>
            <Progress percent={summary.approvalRate} showText={false} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="社区与服务器速览">
            <List
              dataSource={state.communities}
              render={(community) => (
                <List.Item key={community.id}>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Space align="center" size="small">
                      <Typography.Text style={{ fontWeight: 600 }}>{community.name}</Typography.Text>
                      <Tag color="arcoblue">{community.servers.length} 台服务器</Tag>
                      <Typography.Text type="secondary">创建于 {formatTime(community.createdAt)}</Typography.Text>
                    </Space>
                    <Typography.Text type="secondary">
                      {community.servers.length
                        ? community.servers.map((server) => `${server.name} (${server.ip}:${server.port})`).join(' / ')
                        : '当前还没有接入服务器'}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="白名单状态分布">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div className="status-row">
                <div>
                  <Typography.Text type="secondary">已通过</Typography.Text>
                  <Typography.Title heading={5}>{summary.approvedCount}</Typography.Title>
                </div>
                <Tag color="green">允许进入服务器</Tag>
              </div>
              <div className="status-row">
                <div>
                  <Typography.Text type="secondary">待审核</Typography.Text>
                  <Typography.Title heading={5}>{summary.pendingCount}</Typography.Title>
                </div>
                <Tag color="orange">等待管理员处理</Tag>
              </div>
              <div className="status-row">
                <div>
                  <Typography.Text type="secondary">已拒绝</Typography.Text>
                  <Typography.Title heading={5}>{summary.rejectedCount}</Typography.Title>
                </div>
                <Tag color="red">禁止进入服务器</Tag>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
};
