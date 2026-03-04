import { ReactElement } from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    Stack,
    MenuItem,
    Select,
    FormControl,
} from '@mui/material';
import IconifyIcon from '../base/IconifyIcon';

interface FilterBarProps {
    filterStatus: string;
    onFilterStatusChange: (value: string) => void;
    statusOptions?: { value: string; label: string }[];

    sortBy: string;
    onSortByChange: (value: string) => void;
    sortOptions?: { value: string; label: string }[];

    searchQuery: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;

    onReset?: () => void;
    onCheckEquipment?: () => void;
}

const FilterBar = ({
    filterStatus,
    onFilterStatusChange,
    statusOptions = [],
    sortBy,
    onSortByChange,
    sortOptions = [],
    searchQuery,
    onSearchChange,
    searchPlaceholder = 'Search...',
    onReset,
    onCheckEquipment,
}: FilterBarProps): ReactElement => {
    return (
        <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems="flex-end"
            sx={{ mb: 4 }}
        >
            <Box sx={{ width: { xs: '100%', md: 240 } }}>
                <Typography variant="caption" fontWeight={700} mb={1} display="block" color="#64748b" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Filter by status
                </Typography>
                <FormControl fullWidth size="small">
                    <Select
                        value={filterStatus}
                        onChange={(e) => onFilterStatusChange(e.target.value)}
                        sx={{
                            bgcolor: 'white',
                            borderRadius: 2,
                            fontSize: '0.875rem',
                            color: '#1e293b',
                            fontWeight: 500,
                            '& .MuiSelect-select': {
                                py: 1,
                                color: '#1e293b !important'
                            },
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1e293b' }
                        }}
                    >
                        {statusOptions.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.875rem' }}>{opt.label}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>

            <Box sx={{ width: { xs: '100%', md: 240 } }}>
                <Typography variant="caption" fontWeight={700} mb={1} display="block" color="#64748b" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Sort by
                </Typography>
                <FormControl fullWidth size="small">
                    <Select
                        value={sortBy}
                        onChange={(e) => onSortByChange(e.target.value)}
                        sx={{
                            bgcolor: 'white',
                            borderRadius: 2,
                            fontSize: '0.875rem',
                            color: '#1e293b',
                            fontWeight: 500,
                            '& .MuiSelect-select': {
                                py: 1,
                                color: '#1e293b !important'
                            },
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1e293b' }
                        }}
                    >
                        {sortOptions.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.875rem' }}>{opt.label}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>

            <Box sx={{ flexGrow: 1, width: { xs: '100%', md: 'auto' } }}>
                <Typography variant="caption" sx={{ visibility: 'hidden' }}>Search Label Space</Typography>
                <TextField
                    placeholder={searchPlaceholder}
                    size="small"
                    fullWidth
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    sx={{
                        bgcolor: 'white',
                        '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            fontSize: '0.875rem',
                            color: '#1e293b'
                        },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
                    }}
                />
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                    variant="outlined"
                    size="small"
                    sx={{
                        height: 40,
                        px: 2,
                        borderRadius: 2,
                        textTransform: 'none',
                        color: '#64748b',
                        borderColor: '#e2e8f0',
                        fontWeight: 600,
                        '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' }
                    }}
                    onClick={onReset}
                >
                    Reset filters
                </Button>

                {onCheckEquipment && (
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<IconifyIcon icon="mdi:monitor-dashboard" />}
                        onClick={onCheckEquipment}
                        sx={{
                            height: 40,
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 600,
                            color: '#1e293b',
                            borderColor: '#e2e8f0',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        Check equipment
                    </Button>
                )}
            </Box>
        </Stack>
    );
};

export default FilterBar;
