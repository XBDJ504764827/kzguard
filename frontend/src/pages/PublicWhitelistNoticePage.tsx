import { Button, Card, Empty, Grid, Input, Message, Space, Tabs, Tag, Typography } from '@arco-design/web-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi } from '../api/public';
import type { PublicWhitelistStatusFilter, WhitelistPlayer, WhitelistStatus } from '../types';
import { getErrorMessage } from '../utils/error';

const TabPane = Tabs.TabPane;
const Row = Grid.Row;
const Col = Grid.Col;

const statusTextMap: Record<WhitelistStatus, string> = {
  approved: '已通过',
  pending: '待审核',
  rejected: '已拒绝',
};

const statusColorMap: Record<WhitelistStatus, 'green' | 'orange' | 'red'> = {
  approved: 'green',
  pending: 'orange',
  rejected: 'red',
};

const sourceTextMap: Record<WhitelistPlayer['source'], string> = {
  application: '玩家申请',
  manual: '管理员录入',
};

const formatTime = (value?: string) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const renderDetailItem = (label: string, value?: string) => (
  <div className="detail-item">
    <Typography.Text type="secondary" className="detail-item-label">
      {label}
    </Typography.Text>
    <Typography.Paragraph style={{ marginBottom: 0, wordBreak: 'break-all' }}>{value || '-'}</Typography.Paragraph>
  </div>
);

const normalizeStatus = (value: string | null): PublicWhitelistStatusFilter => {
  if (value === 'approved' || value === 'pending' || value === 'rejected') {
    return value;
  }

  return 'all';
};

export const PublicWhitelistNoticePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('search') ?? '');
  const [records, setRecords] = useState<WhitelistPlayer[]>([]);
  const [loading, setLoading] = useState(false);

  const status = normalizeStatus(searchParams.get('status'));
  const search = searchParams.get('search') ?? '';

  useEffect(() => {
    setKeyword(search);
  }, [search]);

  useEffect(() => {
    let mounted = true;

    const loadRecords = async () => {
      setLoading(true);

      try {
        const nextRecords = await publicApi.listWhitelist({ status, search });
        if (mounted) {
          setRecords(nextRecords);
        }
      } catch (error) {
        if (mounted) {
          Message.error(getErrorMessage(error, '白名单公示加载失败'));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadRecords();

    return () => {
      mounted = false;
    };
  }, [search, status]);

  const summary = useMemo(
    () => ({
      total: records.length,
      approved: records.filter((record) => record.status === 'approved').length,
      pending: records.filter((record) => record.status === 'pending').length,
      rejected: records.filter((record) => record.status === 'rejected').length,
    }),
    [records],
  );

  const updateQuery = (nextStatus: PublicWhitelistStatusFilter, nextSearch: string) => {
    const nextParams = new URLSearchParams();

    if (nextStatus !== 'all') {
      nextParams.set('status', nextStatus);
    }

    if (nextSearch.trim()) {
      nextParams.set('search', nextSearch.trim());
    }

    setSearchParams(nextParams);
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card className="page-header-card">
        <Space direction="vertical" size="large" className="page-header-stack">
          <div className="page-toolbar">
            <div>
              <Typography.Title heading={4} style={{ marginBottom: 8 }}>
                白名单公示
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                公开展示已通过、待审核、已拒绝的白名单申请状态，方便玩家通过 SteamID 或游戏名称自助查询。
              </Typography.Paragraph>
            </div>
            <Space wrap className="toolbar-action-group">
              <Tag color="green">已通过 {summary.approved}</Tag>
              <Tag color="orange">待审核 {summary.pending}</Tag>
              <Tag color="red">已拒绝 {summary.rejected}</Tag>
            </Space>
          </div>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">当前结果</Typography.Text>
            <Typography.Title heading={3}>{summary.total}</Typography.Title>
            <Typography.Text>可公开查询的白名单申请记录</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">已通过</Typography.Text>
            <Typography.Title heading={3}>{summary.approved}</Typography.Title>
            <Typography.Text>已通过管理员审核</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">待审核</Typography.Text>
            <Typography.Title heading={3}>{summary.pending}</Typography.Title>
            <Typography.Text>等待管理员处理</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">已拒绝</Typography.Text>
            <Typography.Title heading={3}>{summary.rejected}</Typography.Title>
            <Typography.Text>已结束的申请记录</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Card className="section-card" title="搜索与筛选">
        <Space direction="vertical" size="medium" style={{ width: '100%' }}>
          <div className="page-toolbar">
            <div>
              <Typography.Title heading={5} style={{ marginBottom: 6 }}>
                按 SteamID 或游戏名称搜索
              </Typography.Title>
              <Typography.Text type="secondary">已通过、待审核、已拒绝的白名单申请都会在这里公示，方便玩家快速查询。</Typography.Text>
            </div>
            <div className="toolbar-search-group">
              <Input
                className="public-toolbar-search-input"
                allowClear
                size="large"
                value={keyword}
                placeholder="输入 SteamID 或游戏名称"
                onChange={setKeyword}
                onPressEnter={() => updateQuery(status, keyword)}
              />
              <Button type="primary" size="large" onClick={() => updateQuery(status, keyword)}>
                搜索
              </Button>
            </div>
          </div>

          <Tabs activeTab={status} onChange={(value) => updateQuery(value as PublicWhitelistStatusFilter, keyword)}>
            <TabPane key="all" title="全部" />
            <TabPane key="approved" title="已通过" />
            <TabPane key="pending" title="待审核" />
            <TabPane key="rejected" title="已拒绝" />
          </Tabs>
        </Space>
      </Card>

      {records.length === 0 && !loading ? (
        <Card className="section-card">
          <Empty description="当前没有符合条件的白名单记录" />
        </Card>
      ) : null}

      <Row gutter={[16, 16]}>
        {records.map((record) => (
          <Col key={record.id} xs={24} xl={12}>
            <Card
              className="section-card"
              loading={loading}
              title={
                <Space wrap>
                  <Typography.Text style={{ fontWeight: 700 }}>{record.nickname}</Typography.Text>
                  <Tag color={statusColorMap[record.status]}>{statusTextMap[record.status]}</Tag>
                  <Tag>{sourceTextMap[record.source]}</Tag>
                </Space>
              }
              extra={<Typography.Text type="secondary">{formatTime(record.appliedAt)}</Typography.Text>}
            >
              <div className="detail-grid">
                {renderDetailItem('游戏名称', record.nickname)}
                {renderDetailItem('SteamID', record.steamId)}
                {renderDetailItem('申请时间', formatTime(record.appliedAt))}
                {renderDetailItem('审核时间', formatTime(record.reviewedAt))}
                {renderDetailItem('当前状态', statusTextMap[record.status])}
                {renderDetailItem('记录来源', sourceTextMap[record.source])}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
};
