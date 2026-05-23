import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="h6">页面不存在</Typography>
      <Button variant="contained" onClick={() => navigate('/dashboard')}>
        返回概览
      </Button>
    </Box>
  );
}
