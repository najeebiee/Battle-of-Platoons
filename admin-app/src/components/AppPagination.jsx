import Stack from "@mui/material/Stack";
import Pagination from "@mui/material/Pagination";

export default function AppPagination({
  count,
  page,
  onChange,
  variant = "outlined",
  shape = "rounded",
  size = "small",
  className = "",
  ...rest
}) {
  if (!count || count <= 1) return null;

  const classes = ["table-pagination", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <Stack spacing={2}>
        <Pagination
          count={count}
          page={page}
          onChange={(_, value) => onChange?.(value)}
          variant={variant}
          shape={shape}
          size={size}
          showFirstButton
          showLastButton
          {...rest}
        />
      </Stack>
    </div>
  );
}
