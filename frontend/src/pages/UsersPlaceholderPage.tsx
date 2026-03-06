import { Alert, Button, Card, List, Space, Tag, Typography } from '@arco-design/web-react';
import { useMemo } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';

export const UsersPlaceholderPage = () => {
  const { userSummary, apiMode } = useAppStore();

  const modules = useMemo(
    () =>
      userSummary?.plannedModules ?? [
        '网站管理员账号体系',
        '社区负责人角色权限',
        '玩家个人中心与白名单申请入口',
        '登录、鉴权与操作日志',
      ],
    [userSummary],
  );

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title heading={4} style={{ marginBottom: 8 }}>
          网站用户
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          该模块已预留入口，后续会承载管理员、社区负责人、玩家账号与权限体系。
        </Typography.Paragraph>
      </div>

      <Alert
        type="warning"
        showIcon
        content={`网站用户模块暂未开发，当前信息来自 ${apiMode === 'http' ? '后端占位接口' : '前端 Mock 接口'}。`}
      />

      <Card title="后续规划">
        <List
          dataSource={modules}
          render={(item, index) => (
            <List.Item key={item}>
              <Space>
                <Tag color="purple">TODO {index + 1}</Tag>
                <Typography.Text>{item}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Card>

      <Card title="当前建议">
        <Space direction="vertical" size="medium">
          <Typography.Text>{userSummary?.message ?? '建议下一步优先实现网站用户登录与角色权限。'}</Typography.Text>
          <Button type="primary" disabled>
            待开发
          </Button>
        </Space>
      </Card>
    </Space>
  );
};
