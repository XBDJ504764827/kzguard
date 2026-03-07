import { Button, Card, Empty, Grid, Input, Message, Space, Tabs, Tag, Typography } from '@arco-design/web-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi } from '../api/public';
import type { BanRecord, PublicBanStatusFilter } from '../types';
import { banSourceLabelMap, banStatusColorMap, banStatusLabelMap, banTypeLabelMap, getBanDurationLabel } from '../utils/ban';
import { getErrorMessage } from '../utils/error';
import { websiteAdminRoleLabelMap } from '../utils/websiteAdmin';

const TabPane = Tabs.TabPane;
const Row = Grid.Row;
const Col = Grid.Col;

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

const normalizeStatus = (value: string | null): PublicBanStatusFilter => {
  if (value === 'active' || value === 'revoked') {
    return value;
  }

  return 'all';
};

export const PublicBanNoticePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('search') ?? '');
  const [records, setRecords] = useState<BanRecord[]>([]);
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
        const nextRecords = await publicApi.listBans({ status, search });
        if (mounted) {
          setRecords(nextRecords);
        }
      } catch (error) {
        if (mounted) {
          Message.error(getErrorMessage(error, '封禁公示加载失败'));
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
      active: records.filter((record) => record.status === 'active').length,
      revoked: records.filter((record) => record.status === 'revoked').length,
    }),
    [records],
  );

  const updateQuery = (nextStatus: PublicBanStatusFilter, nextSearch: string) => {
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
                封禁公示
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                公开展示服务器封禁记录，支持按 SteamID 或游戏名称快速查询，方便玩家自助核对状态。
              </Typography.Paragraph>
            </div>
            <Space wrap className="toolbar-action-group">
              <Tag color="red">生效中 {summary.active}</Tag>
              <Tag color="gray">已解除 {summary.revoked}</Tag>
            </Space>
          </div>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card className="metric-card">
            <Typography.Text type="secondary">当前结果</Typography.Text>
            <Typography.Title heading={3}>{summary.total}</Typography.Title>
            <Typography.Text>可公开查询的封禁记录数</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="metric-card">
            <Typography.Text type="secondary">生效中</Typography.Text>
            <Typography.Title heading={3}>{summary.active}</Typography.Title>
            <Typography.Text>当前仍在限制进入服务器</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="metric-card">
            <Typography.Text type="secondary">已解除</Typography.Text>
            <Typography.Title heading={3}>{summary.revoked}</Typography.Title>
            <Typography.Text>保留历史记录供玩家查询</Typography.Text>
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
              <Typography.Text type="secondary">支持搜索 SteamID64、SteamID、SteamID3、游戏名称，也可按状态筛选。</Typography.Text>
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

          <Tabs activeTab={status} onChange={(value) => updateQuery(value as PublicBanStatusFilter, keyword)}>
            <TabPane key="all" title="全部" />
            <TabPane key="active" title="生效中" />
            <TabPane key="revoked" title="已解除" />
          </Tabs>
        </Space>
      </Card>

      {records.length === 0 && !loading ? (
        <Card className="section-card">
          <Empty description="当前没有符合条件的封禁记录" />
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
                  <Typography.Text style={{ fontWeight: 700 }}>{record.nickname || record.steamId}</Typography.Text>
                  <Tag color={banStatusColorMap[record.status]}>{banStatusLabelMap[record.status]}</Tag>
                  <Tag>{banTypeLabelMap[record.banType]}</Tag>
                </Space>
              }
              extra={<Typography.Text type="secondary">{formatTime(record.bannedAt)}</Typography.Text>}
            >
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Space wrap>
                  <Tag color="arcoblue">{record.steamId}</Tag>
                  <Tag color="purple">{record.steamId64}</Tag>
                  <Tag color="cyan">{record.steamId3}</Tag>
                </Space>

                <div className="detail-grid">
                  {renderDetailItem('原始封禁标识', record.steamIdentifier)}
                  {renderDetailItem('玩家 IP', record.ipAddress || '等待玩家下次进服自动回填')}
                  {renderDetailItem('封禁时长', getBanDurationLabel(record.durationSeconds))}
                  {renderDetailItem('封禁原因', record.reason)}
                  {renderDetailItem('所在服务器', record.serverName)}
                  {renderDetailItem('社区组', record.communityName || '-')}
                  {renderDetailItem('执行管理员', `${record.operatorName}（${websiteAdminRoleLabelMap[record.operatorRole]}）`)}
                  {renderDetailItem('记录来源', banSourceLabelMap[record.source])}
                  {renderDetailItem('封禁时间', formatTime(record.bannedAt))}
                  {renderDetailItem('解除时间', formatTime(record.revokedAt))}
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
};
